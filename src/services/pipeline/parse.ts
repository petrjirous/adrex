import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { parse } from "csv-parse";
import type { RuianCsvRow } from "../../types/address.js";

const headerMap: Record<string, keyof RuianCsvRow> = {
  "Kód ADM": "kodAdm",
  "Kód obce": "kodObce",
  "Název obce": "nazevObce",
  "Kód MOMC": "kodMomc",
  "Název MOMC": "nazevMomc",
  "Kód obvodu Prahy": "kodObvoduPrahy",
  "Název obvodu Prahy": "nazevObvoduPrahy",
  "Kód části obce": "kodCastiObce",
  "Název části obce": "nazevCastiObce",
  "Kód ulice": "kodUlice",
  "Název ulice": "nazevUlice",
  "Typ SO": "typSo",
  "Číslo domovní": "cisloDomovni",
  "Číslo orientační": "cisloOrientacni",
  "Znak čísla orientačního": "znakCislaOrientacniho",
  "PSČ": "psc",
  "Souřadnice Y": "souradniceY",
  "Souřadnice X": "souradniceX",
  "Platí Od": "datumPlatnosti",
};

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

async function* parseSingleCsv(csvPath: string): AsyncGenerator<RuianCsvRow> {
  const decoder = new TextDecoder("windows-1250");
  const decodeTransform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      callback(null, decoder.decode(chunk, { stream: true }));
    },
    flush(callback) {
      callback(null, decoder.decode());
    },
  });
  const parser = parse({
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  createReadStream(csvPath).pipe(decodeTransform).pipe(parser);

  for await (const record of parser) {
    const row: RuianCsvRow = {
      kodAdm: "",
      kodObce: "",
      nazevObce: "",
      kodMomc: "",
      nazevMomc: "",
      kodObvoduPrahy: "",
      nazevObvoduPrahy: "",
      kodCastiObce: "",
      nazevCastiObce: "",
      kodUlice: "",
      nazevUlice: "",
      typSo: "",
      cisloDomovni: "",
      cisloOrientacni: "",
      znakCislaOrientacniho: "",
      psc: "",
      souradniceY: "",
      souradniceX: "",
      datumPlatnosti: "",
    };

    for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
      const mappedKey = headerMap[key];
      if (!mappedKey) {
        continue;
      }
      row[mappedKey] = normalizeValue(value);
    }

    yield row;
  }
}

export async function* parseRuianCsv(
  csvDirOrFile: string
): AsyncGenerator<RuianCsvRow> {
  const entries = await readdir(csvDirOrFile).catch(() => null);

  if (entries) {
    const csvFiles = entries
      .filter((entry) => entry.toLowerCase().endsWith(".csv"))
      .sort();

    for (const file of csvFiles) {
      yield* parseSingleCsv(path.join(csvDirOrFile, file));
    }
  } else {
    yield* parseSingleCsv(csvDirOrFile);
  }
}
