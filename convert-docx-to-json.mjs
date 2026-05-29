
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { parseQuizItems } from "./src/quizParser.js";

const input = process.argv[2];
const output = process.argv[3] || input.replace(/\.docx$/i, ".json");

if (!input) {
  throw new Error("Usage: node convert-docx-to-json.mjs <input.docx> [output.json]");
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlToItems(html) {
  const blocks = [...html.matchAll(/<(p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(
    (match) => match[2]
  );
  const sourceBlocks = blocks.length ? blocks : [html];

  return sourceBlocks
    .map((block) => {
      const images = [...block.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(
        (match) => match[1]
      );
      const text = decodeHtml(
        block
          .replace(/<img\b[^>]*>/gi, " ")
          .replace(/<br\s*\/?\s*>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
      )
        .replace(/\s+/g, " ")
        .trim();

      return { text, images };
    })
    .filter((item) => item.text || item.images.length);
}

function preprocessHtml(html) {
  return html.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (match, listContent) => {
    let index = 0;
    return listContent.replace(/<li>([\s\S]*?)<\/li>/gi, (liMatch, liContent) => {
      if (index < 8) {
        const letter = String.fromCharCode(65 + index);
        index++;
        if (!/^[A-H]\s*[.)：:\-]/i.test(liContent.replace(/<[^>]+>/g, "").trim())) {
          return `<li>${letter}. ${liContent}</li>`;
        }
      }
      return liMatch;
    });
  });
}

const buffer = await fs.readFile(input);
const result = await mammoth.convertToHtml(
  { buffer },
  {
    convertImage: mammoth.images.imgElement(async (image) => {
      const base64 = await image.read("base64");
      return {
        src: `data:${image.contentType};base64,${base64}`
      };
    })
  }
);

const parsed = parseQuizItems(htmlToItems(preprocessHtml(result.value)));
const imageCount = parsed.questions.reduce(
  (total, question) =>
    total +
    (question.images?.length || 0) +
    question.choices.reduce((choiceTotal, choice) => choiceTotal + (choice.images?.length || 0), 0),
  0
);

const json = {
  sourceFile: input,
  fileName: path.basename(input),
  generatedAt: new Date().toISOString(),
  questionCount: parsed.questions.length,
  imageCount,
  warningCount: parsed.warnings.length,
  warnings: parsed.warnings,
  questions: parsed.questions
};

await fs.writeFile(output, JSON.stringify(json, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      output,
      questionCount: json.questionCount,
      imageCount: json.imageCount,
      warningCount: json.warningCount,
      warnings: json.warnings.slice(0, 10)
    },
    null,
    2
  )
);
