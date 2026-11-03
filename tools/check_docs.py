#!/usr/bin/env python3
"""Check the adrex Markdown documentation.

Usage: python3 tools/check_docs.py [root]

Scans README.md and docs/*.md under root (default: the current directory) and
prints one `<file>:<line>: <message>` line per problem. Exits 1 if it finds any
problems and 0 if it finds none. Uses only the Python standard library.

Checks:
  - every required file exists;
  - each file has exactly one H1, on line 1;
  - every relative link and anchor resolves (http(s):, mailto: and other
    URL schemes are skipped);
  - every fenced code block declares a language;
  - the bare word TODO appears nowhere, code blocks included.

Headings and links are ignored inside fenced code blocks, inline code spans and
HTML comments. This isn't a full CommonMark parser: other raw HTML blocks, such
as <pre>, are read as Markdown.
"""

import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote

REQUIRED_FILES = (
    "README.md",
    "docs/installation.md",
    "docs/usage.md",
    "docs/configuration.md",
    "docs/troubleshooting.md",
)

QUOTE_MARKER = re.compile(r" {0,3}> ?")
LIST_MARKERS = re.compile(r"^(?:[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+)+")
FENCE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*)$")
COMMENT_START = re.compile(r"^(\s*)<!--")
ATX_HEADING = re.compile(r"^ {0,3}(#{1,6})(?:[ \t]+(.*))?$")
SETEXT_UNDERLINE = re.compile(r"^ {0,3}(=+|-+)[ \t]*$")
NOT_SETEXT_TEXT = re.compile(r"^\s*(?:\||>|#{1,6}(?:\s|$)|[-+*]\s|\d{1,9}[.)]\s)")
TABLE_ROW = re.compile(r"^\s*\|")
REFERENCE_DEFINITION = re.compile(
    r"^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*(<[^>]*>|\S+)"
    r"(?:[ \t]+(?:\"[^\"]*\"|'[^']*'|\([^)]*\)))?[ \t]*$"
)
HTML_LINK = re.compile(r"<(?:a|img)\b[^>]*?\b(?:href|src)\s*=\s*[\"']([^\"']+)[\"']", re.I)
URL_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
TODO_WORD = re.compile(r"\bTODO\b")
ASCII_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"


class Line:
    """One source line, classified by the block scanner."""

    def __init__(self, number, text, is_text):
        self.number = number
        self.text = text
        self.is_text = is_text  # False for fenced code and HTML comment lines


def read_lines(path):
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def strip_quotes(text, limit=None):
    """Remove up to `limit` blockquote markers. Returns (rest, markers_removed)."""
    depth = 0
    while limit is None or depth < limit:
        marker = QUOTE_MARKER.match(text)
        if not marker:
            break
        text = text[marker.end():]
        depth += 1
    return text, depth


def indent_width(text):
    return len(text.expandtabs(4)) - len(text.expandtabs(4).lstrip())


def is_closing_fence(body, fence):
    match = FENCE.match(body)
    return bool(
        match
        and match.group(2)[0] == fence["char"]
        and len(match.group(2)) >= fence["length"]
        and not match.group(3).strip()
        and indent_width(body) - fence["content_indent"] <= 3
    )


def scan_blocks(lines):
    """Split a file into classified lines and fenced-block opening lines.

    Returns (classified_lines, fences). `fences` is a list of
    (line_number, info_string) with one entry per opening fence.
    """
    classified = []
    fences = []
    fence = None
    in_comment = False
    in_list = False
    item_indent = 0

    for number, raw in enumerate(lines, start=1):
        if fence:
            # Quote markers only count if the fence itself was opened inside
            # that many blockquotes. In a plain fence, `> ` is just code.
            body, depth = strip_quotes(raw, fence["quote_depth"])
            left_container = depth < fence["quote_depth"] or (
                body.strip() and indent_width(body) < fence["content_indent"]
            )
            if not left_container:
                classified.append(Line(number, raw, False))
                if is_closing_fence(body, fence):
                    fence = None
                continue
            fence = None  # The blockquote or list item ended, and the fence with it.

        if in_comment:
            classified.append(Line(number, raw, False))
            in_comment = "-->" not in raw
            continue

        body, quote_depth = strip_quotes(raw)
        markers = LIST_MARKERS.match(body)
        if markers:
            in_list = True
            item_indent = len(markers.group().expandtabs(4))
        else:
            in_list = in_list and (not body.strip() or body[0] in " \t")
        content = body[markers.end():] if markers else body

        comment = COMMENT_START.match(content)
        if comment and (len(comment.group(1)) <= 3 or in_list):
            classified.append(Line(number, raw, False))
            in_comment = "-->" not in content[comment.end():]
            continue

        match = FENCE.match(content)
        if match:
            indent = indent_width(content)
            marker, info = match.group(2), match.group(3).strip()
            # An opener indented 4+ outside a list is an indented code block,
            # and backticks in the info string make it an inline code span.
            is_opener = (indent <= 3 or in_list) and not (marker[0] == "`" and "`" in info)
            if is_opener:
                column = indent + (item_indent if markers else 0)
                fence = {
                    "char": marker[0],
                    "length": len(marker),
                    "quote_depth": quote_depth,
                    "content_indent": item_indent if in_list and column >= item_indent else 0,
                }
                fences.append((number, info))
                classified.append(Line(number, raw, False))
                continue

        classified.append(Line(number, raw, True))

    return classified, fences


def find_backtick_run(text, start, length):
    """Return the index of the next backtick run of exactly `length`, or -1."""
    i = start
    while i < len(text):
        if text[i] != "`":
            i += 1
            continue
        run_end = i
        while run_end < len(text) and text[run_end] == "`":
            run_end += 1
        if run_end - i == length:
            return i
        i = run_end
    return -1


def code_span_text(content):
    content = content.replace("\n", " ")
    if len(content) > 1 and content[0] == content[-1] == " " and content.strip():
        return content[1:-1]
    return content


def literal_spans(text):
    """Yield (start, end, rendered_text) for text that isn't inline Markdown.

    Covers backslash escapes, code spans and HTML comments.
    """
    i = 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in ASCII_PUNCTUATION:
            yield i, i + 2, text[i + 1]
            i += 2
        elif text.startswith("<!--", i):
            end = text.find("-->", i + 4)
            if end == -1:
                i += 4
            else:
                yield i, end + 3, ""
                i = end + 3
        elif text[i] == "`":
            run_end = i
            while run_end < len(text) and text[run_end] == "`":
                run_end += 1
            length = run_end - i
            closing = find_backtick_run(text, run_end, length)
            if closing == -1:
                i = run_end  # No closing run: the backticks are literal.
            else:
                yield i, closing + length, code_span_text(text[run_end:closing])
                i = closing + length
        else:
            i += 1


def mask_literals(text):
    """Blank out literal spans, keeping the text's length and line breaks."""
    chars = list(text)
    for start, end, _ in literal_spans(text):
        for index in range(start, end):
            if chars[index] != "\n":
                chars[index] = " "
    return "".join(chars)


def parse_destination(text, start):
    """Parse an inline link destination that starts right after `](`.

    Returns the destination, or None if the text isn't a valid inline link.
    """
    i = start
    while i < len(text) and text[i] in " \t\n":
        i += 1

    if i < len(text) and text[i] == "<":
        end = text.find(">", i)
        if end == -1:
            return None
        destination = text[i + 1:end]
        i = end + 1
    else:
        begin = i
        depth = 0
        while i < len(text) and text[i] not in " \t\n":
            if text[i] == "(":
                depth += 1
            elif text[i] == ")":
                if depth == 0:
                    break
                depth -= 1
            i += 1
        destination = text[begin:i]

    rest = text[i:].lstrip(" \t\n")
    if rest.startswith(")"):
        return destination
    # An optional title may follow the destination.
    if rest[:1] in ('"', "'", "(") and ")" in rest:
        return destination
    return None


def atx_heading(body):
    """Match an ATX heading, which may also start a list item."""
    markers = LIST_MARKERS.match(body)
    return ATX_HEADING.match(body[markers.end():] if markers else body)


def inline_blocks(classified):
    """Group text lines into blocks that Markdown parses inline as one unit.

    Yields lists of (line_number, text). A code span can wrap across the lines
    of a paragraph, but it can't leave the paragraph.
    """
    block = []
    for line in classified:
        body = strip_quotes(line.text)[0] if line.is_text else ""
        stands_alone = atx_heading(body) or SETEXT_UNDERLINE.match(body) or TABLE_ROW.match(body)

        if not body.strip() or stands_alone or LIST_MARKERS.match(body):
            if block:
                yield block
            block = []
        if stands_alone and body.strip():
            yield [(line.number, body)]
        elif body.strip():
            block.append((line.number, body))
    if block:
        yield block


def extract_links(block):
    """Return (line_number, destination) for every link in an inline block."""
    numbers = [number for number, _ in block]
    masked = mask_literals("\n".join(text for _, text in block))
    links = []

    # Reference definitions can't interrupt a paragraph, so they only count at
    # the start of a block.
    for number, text in zip(numbers, masked.split("\n")):
        definition = REFERENCE_DEFINITION.match(text)
        if not definition:
            break
        links.append((number, definition.group(1).strip("<>")))

    def line_of(position):
        return numbers[masked.count("\n", 0, position)]

    # Searching for `](` also finds nested links and hard-wrapped link text.
    position = masked.find("](")
    while position != -1:
        destination = parse_destination(masked, position + 2)
        if destination is not None:
            links.append((line_of(position), destination))
        position = masked.find("](", position + 2)

    for match in HTML_LINK.finditer(masked):
        links.append((line_of(match.start()), match.group(1)))
    return links


def heading_plain_text(text):
    """Reduce heading Markdown to the text GitHub builds the anchor from.

    Code spans and escapes are swapped for placeholders first, so that markup
    stripping can't touch them: `<input>` in backticks is text, not a tag.
    """
    text = re.sub(r"[ \t]+#+$", "", text.strip())
    if re.fullmatch(r"#+", text):
        return ""

    literals = []
    pieces = []
    position = 0
    for start, end, rendered in literal_spans(text):
        pieces.append(text[position:start])
        pieces.append(f"{len(literals)}")
        literals.append(rendered)
        position = end
    pieces.append(text[position:])
    text = "".join(pieces)

    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\[[^\]]*\]", r"\1", text)
    text = re.sub(r"<[^>]+>", "", text)
    # Emphasis markers disappear, but snake_case stays.
    text = re.sub(r"\*+", "", text)
    text = re.sub(r"(?<![^\s(])_+|_+(?![^\s).,:;!?])", "", text)

    text = re.sub("(\\d+)", lambda match: literals[int(match.group(1))], text)
    return text.strip()


def slugify(text):
    """Apply GitHub's slug rules to a heading's plain text.

    Lowercase, drop punctuation other than `-` and `_`, keep letters with
    diacritics, and turn each space into `-`. GitHub keeps `_` as a word
    character, so PIPELINE_BATCH_SIZE becomes pipeline_batch_size.
    """
    kept = [
        char
        for char in text.lower()
        if char.isalnum() or char in "-_ " or unicodedata.category(char).startswith("M")
    ]
    return "".join(kept).replace(" ", "-")


def find_headings(classified):
    """Return (line_number, level, plain_text) for each heading in the text."""
    headings = []
    previous = None

    for line in classified:
        if not line.is_text:
            previous = None
            continue

        body = strip_quotes(line.text)[0]

        atx = atx_heading(body)
        if atx:
            headings.append((line.number, len(atx.group(1)), heading_plain_text(atx.group(2) or "")))
            previous = None
            continue

        underline = SETEXT_UNDERLINE.match(body)
        if underline and previous is not None:
            level = 1 if underline.group(1)[0] == "=" else 2
            headings.append((previous[0], level, heading_plain_text(previous[1])))
            previous = None
            continue

        is_text = body.strip() and not NOT_SETEXT_TEXT.match(body)
        previous = (line.number, body) if is_text else None

    return headings


def collect_anchors(classified):
    """Return every anchor in a file, adding -1, -2 suffixes to repeats."""
    anchors = set()
    occurrences = {}
    for _, _, text in find_headings(classified):
        base = slugify(text)
        slug = base
        while slug in anchors:
            occurrences[base] = occurrences.get(base, 0) + 1
            slug = f"{base}-{occurrences[base]}"
        anchors.add(slug)
    return anchors


def exists_with_exact_case(root, target):
    """Check a path segment by segment, so that macOS and Windows agree with
    the case-sensitive file system GitHub links resolve against."""
    current = root
    for part in target.relative_to(root).parts:
        try:
            if part not in {entry.name for entry in current.iterdir()}:
                return False
        except (NotADirectoryError, FileNotFoundError, PermissionError):
            return False
        current = current / part
    return True


class Checker:
    def __init__(self, root):
        self.root = root.resolve()
        self.problems = []
        self.anchor_cache = {}

    def report(self, relative_path, line, message):
        self.problems.append((relative_path, line, message))

    def anchors_of(self, path):
        if path not in self.anchor_cache:
            classified, _ = scan_blocks(read_lines(path))
            self.anchor_cache[path] = collect_anchors(classified)
        return self.anchor_cache[path]

    def check_link(self, relative_path, path, line, link):
        link = link.strip()
        if not link or URL_SCHEME.match(link) or link.startswith("//"):
            return

        target_text, _, fragment = link.partition("#")
        target_text = unquote(target_text.partition("?")[0])
        fragment = unquote(fragment)

        if not target_text:
            target = path
        elif target_text.startswith("/"):
            self.report(relative_path, line, f"link is not relative: {link}")
            return
        else:
            target = (path.parent / target_text).resolve()
            if not target.is_relative_to(self.root):
                self.report(relative_path, line, f"link points outside the repository: {link}")
                return
            if not exists_with_exact_case(self.root, target):
                self.report(relative_path, line, f"broken link: {link}")
                return

        if fragment and target.is_file() and target.suffix.lower() == ".md":
            if fragment not in self.anchors_of(target):
                self.report(relative_path, line, f"broken anchor: {link}")

    def check_file(self, relative_path):
        path = self.root / relative_path
        lines = read_lines(path)
        classified, fences = scan_blocks(lines)

        h1s = [(number, text) for number, level, text in find_headings(classified) if level == 1]
        h1_lines = [number for number, _ in h1s]
        for number, text in h1s:
            if not text:
                self.report(relative_path, number, "H1 title is empty")

        if not h1_lines:
            self.report(relative_path, 1, "missing H1 title")
        else:
            if h1_lines[0] != 1:
                self.report(relative_path, h1_lines[0], "H1 title must be on line 1")
            for number in h1_lines[1:]:
                self.report(relative_path, number, "more than one H1 title")

        for number, info in fences:
            if not info:
                self.report(relative_path, number, "fenced code block has no language")

        for line in classified:
            if TODO_WORD.search(line.text):
                self.report(relative_path, line.number, "bare TODO, use a '> **TBD:** ...' note")

        for block in inline_blocks(classified):
            for number, link in extract_links(block):
                self.check_link(relative_path, path, number, link)

    def run(self):
        for required in REQUIRED_FILES:
            if not (self.root / required).is_file():
                self.report(required, 1, "required file is missing")

        scanned = []
        if (self.root / "README.md").is_file():
            scanned.append("README.md")
        scanned.extend(
            path.relative_to(self.root).as_posix()
            for path in sorted((self.root / "docs").glob("*.md"))
            if path.is_file()
        )
        for relative_path in scanned:
            self.check_file(relative_path)

        return sorted(self.problems)


def main(argv):
    if len(argv) > 2:
        print("usage: check_docs.py [root]", file=sys.stderr)
        return 2

    root = Path(argv[1]) if len(argv) == 2 else Path.cwd()
    problems = Checker(root).run()
    for file_name, line, message in problems:
        print(f"{file_name}:{line}: {message}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
