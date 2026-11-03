"""Tests for tools/check_docs.py.

Each test builds a small Markdown tree in a temporary directory and runs the
script against it as a subprocess, the same way a user runs it.
"""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "tools" / "check_docs.py"

FENCE = "```"

# Only docs/troubleshooting.md is a link target here, and no test replaces or
# deletes it, so a test that changes another page sees only its own problem.
CLEAN_TREE = {
    "README.md": (
        "# Project\n"
        "\n"
        f"{FENCE}bash\n"
        "# a comment, not a heading\n"
        "npm install\n"
        f"{FENCE}\n"
        "\n"
        "- [Troubleshooting](docs/troubleshooting.md)\n"
        "- [Diacritics](docs/troubleshooting.md#chyba-při-importu-z-rúianu)\n"
    ),
    "docs/installation.md": "# Installation\n\nSee [the FAQ](troubleshooting.md).\n",
    "docs/usage.md": "# Usage\n",
    "docs/configuration.md": "# Configuration\n",
    "docs/troubleshooting.md": (
        "# Troubleshooting\n"
        "\n"
        "## Chyba při importu z RÚIANu\n"
        "\n"
        "Jump to [the import](#chyba-při-importu-z-rúianu).\n"
    ),
}


class CheckDocsTestCase(unittest.TestCase):
    def setUp(self):
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        self.root = Path(temp_dir.name)
        for name, content in CLEAN_TREE.items():
            self.write(name, content)

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def run_checker(self):
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(self.root)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )

    def assert_clean(self):
        result = self.run_checker()
        self.assertEqual(result.stdout, "")
        self.assertEqual(result.returncode, 0)

    def assert_problem(self, location, fragment):
        """Assert exit code 1 and exactly one `<file>:<line>:` problem."""
        result = self.run_checker()
        self.assertEqual(result.returncode, 1, result.stdout)
        lines = result.stdout.splitlines()
        self.assertEqual(len(lines), 1, result.stdout)
        self.assertTrue(lines[0].startswith(f"{location}: "), lines[0])
        self.assertIn(fragment, lines[0])


class CleanTreeTests(CheckDocsTestCase):
    def test_clean_tree_exits_zero(self):
        self.assert_clean()

    def test_root_defaults_to_current_directory(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT)], capture_output=True, text=True, cwd=self.root
        )
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_default_root_finds_problems_in_current_directory(self):
        (self.root / "docs" / "usage.md").unlink()
        result = subprocess.run(
            [sys.executable, str(SCRIPT)], capture_output=True, text=True, cwd=self.root
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("docs/usage.md:1: ", result.stdout)


class RequiredFileTests(CheckDocsTestCase):
    def test_missing_required_file(self):
        (self.root / "docs" / "configuration.md").unlink()
        self.assert_problem("docs/configuration.md:1", "missing")

    def test_missing_readme(self):
        (self.root / "README.md").unlink()
        self.assert_problem("README.md:1", "missing")

    def test_missing_docs_directory_reports_every_page(self):
        for name in CLEAN_TREE:
            if name.startswith("docs/"):
                (self.root / name).unlink()
        (self.root / "docs").rmdir()
        self.write("README.md", "# Project\n")
        result = self.run_checker()
        self.assertEqual(result.returncode, 1)
        for name in CLEAN_TREE:
            if name.startswith("docs/"):
                self.assertIn(f"{name}:1: ", result.stdout)


class HeadingTests(CheckDocsTestCase):
    def test_missing_h1(self):
        self.write("docs/usage.md", "Some text.\n\n## Not an H1\n")
        self.assert_problem("docs/usage.md:1", "H1")

    def test_h1_with_no_title(self):
        for title in ("#", "# ", "# #"):
            with self.subTest(title=title):
                self.write("docs/usage.md", f"{title}\n\nText.\n")
                self.assert_problem("docs/usage.md:1", "H1")

    def test_h1_in_a_list_item_counts(self):
        self.write("docs/usage.md", "# Usage\n\n- # Again\n")
        self.assert_problem("docs/usage.md:3", "H1")

    def test_empty_file_has_no_h1(self):
        self.write("docs/usage.md", "")
        self.assert_problem("docs/usage.md:1", "H1")

    def test_two_h1s(self):
        self.write("docs/usage.md", "# Usage\n\ntext\n\n# Again\n")
        self.assert_problem("docs/usage.md:5", "H1")

    def test_h1_not_on_line_one(self):
        self.write("docs/usage.md", "\n# Usage\n")
        self.assert_problem("docs/usage.md:2", "line 1")

    def test_setext_h1_counts_as_second_h1(self):
        self.write("docs/usage.md", "# Usage\n\nAgain\n=====\n")
        self.assert_problem("docs/usage.md:3", "H1")

    def test_comment_in_fence_is_not_a_heading(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}bash\n# comment\n{FENCE}\n\n~~~bash\n# comment\n~~~\n",
        )
        self.assert_clean()

    def test_hash_without_space_is_not_a_heading(self):
        self.write("docs/usage.md", "# Usage\n\n#hashtag\n")
        self.assert_clean()

    def test_table_rule_is_not_a_setext_heading(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n| Name |\n|---|\n| a |\n\nSee [x](#name).\n",
        )
        self.assert_problem("docs/usage.md:7", "anchor")


class LinkTests(CheckDocsTestCase):
    def test_broken_relative_link(self):
        self.write("docs/usage.md", "# Usage\n\nSee [missing](nope.md).\n")
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_broken_image_link(self):
        self.write("docs/usage.md", "# Usage\n\n![alt](img/none.png)\n")
        self.assert_problem("docs/usage.md:3", "img/none.png")

    def test_broken_reference_definition(self):
        self.write("docs/usage.md", "# Usage\n\nSee [a][ref].\n\n[ref]: nope.md\n")
        self.assert_problem("docs/usage.md:5", "nope.md")

    def test_broken_html_link(self):
        self.write("docs/usage.md", '# Usage\n\n<a href="nope.md">x</a>\n')
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_links_resolve_against_the_linking_file(self):
        self.write("docs/usage.md", "# Usage\n\nSee [wrong](docs/installation.md).\n")
        self.assert_problem("docs/usage.md:3", "docs/installation.md")

    def test_directory_link_resolves(self):
        self.write("k8s/README.md", "# K8s\n")
        self.write("docs/usage.md", "# Usage\n\n[dir](../k8s/) and [file](../k8s/README.md)\n")
        self.assert_clean()

    def test_absolute_path_link_is_rejected(self):
        self.write("docs/usage.md", "# Usage\n\n[abs](/docs/installation.md)\n")
        self.assert_problem("docs/usage.md:3", "relative")

    def test_link_outside_root_is_rejected(self):
        self.write("docs/usage.md", "# Usage\n\n[out](../../outside.md)\n")
        self.assert_problem("docs/usage.md:3", "outside")

    def test_wrong_case_in_file_name_is_broken(self):
        self.write("docs/usage.md", "# Usage\n\n[case](Installation.md)\n")
        self.assert_problem("docs/usage.md:3", "Installation.md")

    def test_external_links_are_skipped(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n"
            "[a](http://example.invalid/x.md) [b](https://example.invalid/#y) "
            "[c](mailto:someone@example.invalid)\n",
        )
        self.assert_clean()

    def test_links_in_fences_are_ignored(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}markdown\n[x](nope.md)\n{FENCE}\n",
        )
        self.assert_clean()

    def test_links_in_inline_code_are_ignored(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\nWrite `[x](nope.md)` or ``[y](nope.md) ` tick``.\n",
        )
        self.assert_clean()

    def test_link_after_inline_code_is_checked(self):
        self.write("docs/usage.md", "# Usage\n\nUse `code` then [x](nope.md).\n")
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_link_text_with_inline_code_is_checked(self):
        self.write("docs/usage.md", "# Usage\n\n[`code`](nope.md)\n")
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_escaped_brackets_are_not_a_link(self):
        self.write("docs/usage.md", "# Usage\n\n\\[x\\](nope.md)\n")
        self.assert_clean()

    def test_label_followed_by_prose_is_not_a_definition(self):
        self.write("docs/usage.md", "# Usage\n\n[Note]: this is not a definition\n")
        self.assert_clean()

    def test_definition_with_title_is_checked(self):
        self.write("docs/usage.md", '# Usage\n\n[ref]: nope.md "A title"\n')
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_consecutive_definitions_are_checked(self):
        self.write("docs/usage.md", "# Usage\n\n[a]: installation.md\n[b]: nope.md\n")
        self.assert_problem("docs/usage.md:4", "nope.md")

    def test_definition_cannot_interrupt_a_paragraph(self):
        self.write("docs/usage.md", "# Usage\n\nSome text\n[a]: nope.md\n")
        self.assert_clean()

    def test_code_span_wrapped_across_lines_is_ignored(self):
        self.write("docs/usage.md", "# Usage\n\nsplit `[x](nope.md)\nstill code` here\n")
        self.assert_clean()

    def test_link_after_wrapped_code_span_reports_its_own_line(self):
        self.write("docs/usage.md", "# Usage\n\nsplit `code\nstill code` then [x](nope.md)\n")
        self.assert_problem("docs/usage.md:4", "nope.md")

    def test_code_span_cannot_cross_a_paragraph_break(self):
        self.write("docs/usage.md", "# Usage\n\nstray ` tick\n\n[x](nope.md) ` tick\n")
        self.assert_problem("docs/usage.md:5", "nope.md")

    def test_code_span_cannot_cross_list_items(self):
        self.write("docs/usage.md", "# Usage\n\n- stray ` tick\n- [x](nope.md) ` tick\n")
        self.assert_problem("docs/usage.md:4", "nope.md")

    def test_link_text_wrapped_across_lines_is_checked(self):
        self.write("docs/usage.md", "# Usage\n\n[wrapped\ntext](nope.md)\n")
        self.assert_problem("docs/usage.md:4", "nope.md")

    def test_link_with_title_is_checked(self):
        self.write("docs/usage.md", '# Usage\n\n[x](nope.md "A title")\n')
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_angle_bracket_destination_with_space(self):
        self.write("docs/my page.md", "# Page\n")
        self.write("docs/usage.md", "# Usage\n\n[x](<my page.md>) [y](my%20page.md)\n")
        self.assert_clean()


class AnchorTests(CheckDocsTestCase):
    def test_broken_anchor_in_other_file(self):
        self.write("README.md", "# Project\n\n[x](docs/usage.md#nope)\n")
        self.assert_problem("README.md:3", "docs/usage.md#nope")

    def test_broken_same_file_anchor(self):
        self.write("docs/usage.md", "# Usage\n\n[x](#nope)\n")
        self.assert_problem("docs/usage.md:3", "#nope")

    def test_anchor_case_must_match_the_slug(self):
        self.write("docs/usage.md", "# Usage\n\n[x](#Usage)\n")
        self.assert_problem("docs/usage.md:3", "#Usage")

    def test_anchor_in_file_outside_the_scanned_set(self):
        self.write("TUTORIAL.md", "# Tutorial\n\n## Part 1: Local\n")
        self.write(
            "docs/usage.md",
            "# Usage\n\n[x](../TUTORIAL.md#part-1-local)\n",
        )
        self.assert_clean()

    def test_heading_in_fence_is_not_an_anchor_target(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}bash\n## Fake\n{FENCE}\n\n[x](#fake)\n",
        )
        self.assert_problem("docs/usage.md:7", "#fake")

    def test_slug_rules(self):
        cases = [
            ("## Import dat z RÚIANu", "import-dat-z-rúianu"),
            ("## Příliš žluťoučký kůň", "příliš-žluťoučký-kůň"),
            ("## What's new? (v2.0)", "whats-new-v20"),
            ("## Docker & Compose", "docker--compose"),
            ("## `/health` stays ok", "health-stays-ok"),
            ("## Pre-flight check", "pre-flight-check"),
            ("## **Bold** and *italic*", "bold-and-italic"),
            ("## [Linked](installation.md) title", "linked-title"),
            ("## PIPELINE_BATCH_SIZE", "pipeline_batch_size"),
            ("## Closed heading ##", "closed-heading"),
            ("### The `<input>` tag", "the-input-tag"),
            ("### `<html data-adrex-theme>` is overwritten", "html-data-adrex-theme-is-overwritten"),
            ("## Use `[a](b)` syntax", "use-ab-syntax"),
            ("## Use ``a`b`` ticks", "use-ab-ticks"),
            ("## [`code`](installation.md) link", "code-link"),
            ("## Real <b>bold</b> tag", "real-bold-tag"),
            ("## Escaped \\<b\\> tag", "escaped-b-tag"),
            ("## `snake_case` and __bold__", "snake_case-and-bold"),
            ("Setext title\n---", "setext-title"),
        ]
        for heading, slug in cases:
            with self.subTest(heading=heading):
                self.write("docs/usage.md", f"# Usage\n\n{heading}\n\n[x](#{slug})\n")
                self.assert_clean()

    def test_anchor_with_code_span_content_deleted_is_broken(self):
        self.write("docs/usage.md", "# Usage\n\n## The `<input>` tag\n\n[x](#the--tag)\n")
        self.assert_problem("docs/usage.md:5", "#the--tag")

    def test_percent_encoded_anchor(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n## Kód\n\n[x](#k%C3%B3d)\n",
        )
        self.assert_clean()

    def test_repeated_headings_get_numeric_suffixes(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n## Example\n\n## Example\n\n## Example\n\n"
            "[a](#example) [b](#example-1) [c](#example-2)\n",
        )
        self.assert_clean()

    def test_suffix_past_the_last_repeat_is_broken(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n## Example\n\n## Example\n\n[x](#example-2)\n",
        )
        self.assert_problem("docs/usage.md:7", "#example-2")


class FenceTests(CheckDocsTestCase):
    def test_code_block_without_language(self):
        self.write("docs/usage.md", f"# Usage\n\n{FENCE}\nplain\n{FENCE}\n")
        self.assert_problem("docs/usage.md:3", "language")

    def test_tilde_block_without_language(self):
        self.write("docs/usage.md", "# Usage\n\n~~~\nplain\n~~~\n")
        self.assert_problem("docs/usage.md:3", "language")

    def test_closing_fences_are_not_reported(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}bash\na\n{FENCE}\n\n{FENCE}text\nb\n{FENCE}\n",
        )
        self.assert_clean()

    def test_second_block_after_a_good_one_is_reported(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}bash\na\n{FENCE}\n\n{FENCE}\nb\n{FENCE}\n",
        )
        self.assert_problem("docs/usage.md:7", "language")

    def test_longer_fence_contains_shorter_one(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}`markdown\n{FENCE}\n# inside\n{FENCE}\n{FENCE}`\n",
        )
        self.assert_clean()

    def test_fence_with_info_string_does_not_close_a_block(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}markdown\n{FENCE}bash\n# inside\n{FENCE}\n",
        )
        self.assert_clean()

    def test_fence_nested_in_a_list(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n1. Step\n\n    {FENCE}\n    plain\n    {FENCE}\n",
        )
        self.assert_problem("docs/usage.md:5", "language")

    def test_fence_in_a_blockquote(self):
        self.write("docs/usage.md", f"# Usage\n\n> {FENCE}\n> # inside\n> {FENCE}\n")
        self.assert_problem("docs/usage.md:3", "language")

    def test_inline_triple_backticks_are_not_a_fence(self):
        self.write("docs/usage.md", f"# Usage\n\n{FENCE}inline{FENCE}\n\n# Second\n")
        self.assert_problem("docs/usage.md:5", "H1")


class ContainerFenceTests(CheckDocsTestCase):
    def test_fence_opened_on_a_list_marker_line(self):
        for marker in ("- ", "* ", "1. ", "10) "):
            with self.subTest(marker=marker):
                pad = " " * len(marker)
                self.write(
                    "docs/usage.md",
                    f"# Usage\n\n{marker}{FENCE}bash\n{pad}# comment\n{pad}{FENCE}\n",
                )
                self.assert_clean()

    def test_fence_on_a_nested_list_marker_line(self):
        self.write("docs/usage.md", f"# Usage\n\n- - {FENCE}bash\n    # comment\n    {FENCE}\n")
        self.assert_clean()

    def test_no_language_on_a_list_marker_line_is_reported_at_the_opener(self):
        self.write("docs/usage.md", f"# Usage\n\n- {FENCE}\n  # comment\n  {FENCE}\n")
        self.assert_problem("docs/usage.md:3", "language")

    def test_fence_on_a_marker_line_in_a_blockquote(self):
        self.write("docs/usage.md", f"# Usage\n\n> - {FENCE}bash\n>   # comment\n>   {FENCE}\n")
        self.assert_clean()

    def test_fence_ends_with_its_list_item(self):
        self.write("docs/usage.md", f"# Usage\n\n- {FENCE}bash\n  code\n\n# Second\n")
        self.assert_problem("docs/usage.md:6", "H1")

    def test_blank_line_keeps_a_list_fence_open(self):
        self.write("docs/usage.md", f"# Usage\n\n- {FENCE}bash\n  a\n\n  # comment\n  {FENCE}\n")
        self.assert_clean()

    def test_fence_continuing_a_list_item_ends_with_it(self):
        self.write("docs/usage.md", f"# Usage\n\n- Item\n\n  {FENCE}bash\n  code\n\n# Second\n")
        self.assert_problem("docs/usage.md:8", "H1")

    def test_quoted_lines_do_not_close_a_plain_fence(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}markdown\n> {FENCE}\n> # quoted\n> {FENCE}\n{FENCE}\n",
        )
        self.assert_clean()

    def test_deeper_quote_does_not_close_a_quoted_fence(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n> {FENCE}markdown\n> > {FENCE}\n> > # quoted\n> {FENCE}\n",
        )
        self.assert_clean()

    def test_fence_ends_with_its_blockquote(self):
        self.write("docs/usage.md", f"# Usage\n\n> {FENCE}bash\n> code\n\n# Second\n")
        self.assert_problem("docs/usage.md:6", "H1")

    def test_closing_fence_indented_four_spaces_is_code(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}bash\n    {FENCE}\n# comment\n{FENCE}\n",
        )
        self.assert_clean()


class HtmlCommentTests(CheckDocsTestCase):
    def test_headings_in_a_comment_are_ignored(self):
        self.write("docs/usage.md", "# Usage\n\n<!--\n# not a heading\n-->\n")
        self.assert_clean()

    def test_heading_in_a_comment_is_not_an_anchor_target(self):
        self.write("docs/usage.md", "# Usage\n\n<!--\n## Hidden\n-->\n\n[x](#hidden)\n")
        self.assert_problem("docs/usage.md:7", "#hidden")

    def test_links_in_a_comment_are_ignored(self):
        self.write(
            "docs/usage.md",
            "# Usage\n\n<!-- [x](nope.md) -->\n\n<!--\n\n[y](nope.md)\n-->\n",
        )
        self.assert_clean()

    def test_inline_comment_is_ignored_but_the_rest_of_the_line_is_not(self):
        self.write("docs/usage.md", "# Usage\n\nText <!-- [x](gone.md) --> [y](nope.md)\n")
        self.assert_problem("docs/usage.md:3", "nope.md")

    def test_fence_in_a_comment_is_ignored(self):
        self.write("docs/usage.md", f"# Usage\n\n<!--\n{FENCE}\nplain\n-->\n")
        self.assert_clean()

    def test_content_after_a_comment_is_checked(self):
        self.write("docs/usage.md", "# Usage\n\n<!--\nhidden\n-->\n\n[x](nope.md)\n")
        self.assert_problem("docs/usage.md:7", "nope.md")

    def test_comment_in_a_fence_stays_code(self):
        self.write(
            "docs/usage.md",
            f"# Usage\n\n{FENCE}html\n<!--\n{FENCE}\n\n[x](nope.md)\n",
        )
        self.assert_problem("docs/usage.md:7", "nope.md")

    def test_todo_in_a_comment_is_still_reported(self):
        self.write("docs/usage.md", "# Usage\n\n<!--\nTODO later\n-->\n")
        self.assert_problem("docs/usage.md:4", "TODO")


class TodoTests(CheckDocsTestCase):
    def test_bare_todo(self):
        self.write("docs/usage.md", "# Usage\n\nTODO: write this.\n")
        self.assert_problem("docs/usage.md:3", "TODO")

    def test_todo_in_code_block(self):
        self.write("docs/usage.md", f"# Usage\n\n{FENCE}bash\n# TODO later\n{FENCE}\n")
        self.assert_problem("docs/usage.md:4", "TODO")

    def test_todo_in_inline_code(self):
        self.write("docs/usage.md", "# Usage\n\nSee `TODO` here.\n")
        self.assert_problem("docs/usage.md:3", "TODO")

    def test_only_whole_case_sensitive_word_matches(self):
        self.write("docs/usage.md", "# Usage\n\nTODOS, todo, Todo and MYTODO are fine.\n")
        self.assert_clean()

    def test_tbd_placeholder_is_fine(self):
        self.write("docs/usage.md", "# Usage\n\n> **TBD:** minimum RAM size\n")
        self.assert_clean()


class OutputTests(CheckDocsTestCase):
    def test_every_problem_gets_its_own_line(self):
        self.write(
            "docs/usage.md",
            f"Text.\n\n[x](nope.md)\n\nTODO\n\n{FENCE}\nplain\n{FENCE}\n",
        )
        result = self.run_checker()
        self.assertEqual(result.returncode, 1)
        lines = result.stdout.splitlines()
        self.assertEqual(len(lines), 4, result.stdout)
        for prefix in ("docs/usage.md:1: ", "docs/usage.md:3: ", "docs/usage.md:5: ", "docs/usage.md:7: "):
            self.assertTrue(any(line.startswith(prefix) for line in lines), prefix)

    def test_extra_docs_pages_are_scanned(self):
        self.write("docs/extra.md", "No title here.\n")
        self.assert_problem("docs/extra.md:1", "H1")

    def test_files_outside_the_scanned_set_are_ignored(self):
        self.write("TUTORIAL.md", "No title, TODO, [x](nope.md)\n")
        self.write("docs/nested/deep.md", "No title\n")
        self.assert_clean()


if __name__ == "__main__":
    unittest.main()
