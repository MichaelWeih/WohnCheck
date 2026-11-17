import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const shouldFix = process.argv.includes("--fix");
const root = process.cwd();

const targets = [
  "src",
  "backend/src",
  "backend/prisma",
  "docs",
  "README.md",
  "backend/README.md",
];

const ignoredDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".vscode",
]);

const allowedExtensions = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
]);

const replacements = [
  ["Muenchen", "München"],
  ["Duesseldorf", "Düsseldorf"],
  ["Gemeinnuetzige", "Gemeinnützige"],
  ["Gebaeude", "Gebäude"],
  ["Naechste", "Nächste"],
  ["Fuer", "Für"],
  ["fuer", "für"],
  ["Ueber", "Über"],
  ["ueber", "über"],
  ["Oeffentliche", "Öffentliche"],
  ["oeffentliche", "öffentliche"],
  ["oeffentlichen", "öffentlichen"],
  ["veroeffentlichte", "veröffentlichte"],
  ["Kautionsrueckgabe", "Kautionsrückgabe"],
  ["Laerm", "Lärm"],
  ["Muellsituation", "Müllsituation"],
  ["Freizeitaktivitaeten", "Freizeitaktivitäten"],
  ["kuemmert", "kümmert"],
  ["Wuerde", "Würde"],
  ["wuerde", "würde"],
  ["ueberhaupt", "überhaupt"],
  ["haeufig", "häufig"],
  ["Klaerungswege", "Klärungswege"],
  ["Rueckmeldungen", "Rückmeldungen"],
  ["Rueckgabe", "Rückgabe"],
  ["Raeumen", "Räumen"],
  ["Einzelfaelle", "Einzelfälle"],
  ["enthaelt", "enthält"],
  ["spuerbarer", "spürbarer"],
  ["waehrend", "während"],
  ["Mieterunterstuetzung", "Mieterunterstützung"],
  ["Einschaetzung", "Einschätzung"],
  ["Geschaeftsbericht", "Geschäftsbericht"],
  ["gegenueber", "gegenüber"],
  ["Groesse", "Größe"],
  ["grossen", "großen"],
  ["uebernommenen", "übernommenen"],
  ["zurueck", "zurück"],
  ["spaeter", "später"],
  ["Loesung", "Lösung"],
  ["Moegliche", "Mögliche"],
  ["koennen", "können"],
  ["muessen", "müssen"],
];

const uniqueReplacements = Array.from(new Map(replacements).entries());

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectFiles(path) {
  const absolutePath = join(root, path);
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return [absolutePath];
  }

  return readdirSync(absolutePath).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) {
      return [];
    }

    const childPath = join(absolutePath, entry);
    const childStats = statSync(childPath);

    if (childStats.isDirectory()) {
      return collectFiles(relative(root, childPath));
    }

    const extension = entry.match(/\.[^.]+$/)?.[0] ?? "";
    return allowedExtensions.has(extension) ? [childPath] : [];
  });
}

function stripIgnoredText(line) {
  return line
    .replace(/https?:\/\/[^"')\s]+/g, "")
    .replace(/\bslug:\s*"[^"]*"/g, "")
    .replace(/\bsourceKey:\s*"[^"]*"/g, "")
    .replace(/\bcalculationVersion:\s*"[^"]*"/g, "");
}

function applyUmlautFixes(content) {
  return content
    .split("\n")
    .map((line) => {
      const ignoredSegments = [];
      const maskedLine = line.replace(
        /https?:\/\/[^"')\s]+|\bslug:\s*"[^"]*"|\bsourceKey:\s*"[^"]*"|\bcalculationVersion:\s*"[^"]*"/g,
        (match) => {
          const token = `__UMLAUT_IGNORE_${ignoredSegments.length}__`;
          ignoredSegments.push(match);
          return token;
        },
      );

      const fixedLine = uniqueReplacements.reduce((current, [from, to]) => {
        return current.replace(new RegExp(escapeRegExp(from), "g"), to);
      }, maskedLine);

      return ignoredSegments.reduce(
        (current, segment, index) => current.replace(`__UMLAUT_IGNORE_${index}__`, segment),
        fixedLine,
      );
    })
    .join("\n");
}

const findings = [];
const files = targets.flatMap(collectFiles);

for (const file of files) {
  const originalContent = readFileSync(file, "utf8");

  if (shouldFix) {
    const fixedContent = applyUmlautFixes(originalContent);

    if (fixedContent !== originalContent) {
      writeFileSync(file, fixedContent);
    }
  }

  const content = shouldFix ? readFileSync(file, "utf8") : originalContent;

  content.split("\n").forEach((line, index) => {
    const searchableLine = stripIgnoredText(line);

    for (const [from, to] of uniqueReplacements) {
      if (searchableLine.includes(from)) {
        findings.push({
          file: relative(root, file),
          line: index + 1,
          from,
          to,
          text: line.trim(),
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Umlaut-Schreibweisen gefunden. Bitte echte Umlaute verwenden:");

  for (const finding of findings) {
    console.error(
      `${finding.file}:${finding.line} ${finding.from} -> ${finding.to}: ${finding.text}`,
    );
  }

  console.error("\nAutomatisch korrigieren: npm run lint:umlauts:fix");
  process.exit(1);
}

console.log("Umlaut-Check bestanden.");
