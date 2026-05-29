import mammoth from "mammoth/mammoth.browser";
import { cleanText } from "./utils.js";

export async function extractDocxItems(arrayBuffer) {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read("base64");
        return {
          src: `data:${image.contentType};base64,${base64}`
        };
      })
    }
  );

  const documentHtml = new DOMParser().parseFromString(result.value, "text/html");

  // Preprocess ordered lists to insert explicit A., B., C., D. prefixes
  documentHtml.querySelectorAll("ol").forEach((ol) => {
    const listItems = ol.querySelectorAll("li");
    listItems.forEach((li, index) => {
      if (index < 8) {
        const letter = String.fromCharCode(65 + index);
        const text = li.textContent.trim();
        if (!/^[A-H]\s*[.)：:\-]/i.test(text)) {
          li.innerHTML = `${letter}. ${li.innerHTML}`;
        }
      }
    });
  });

  const blocks = [...documentHtml.body.querySelectorAll("p, li, td, th")];
  const nodes = blocks.length ? blocks : [...documentHtml.body.children];

  return nodes.flatMap((node) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    const images = [...clone.querySelectorAll("img")].map((image) => image.getAttribute("src")).filter(Boolean);
    clone.querySelectorAll("img").forEach((image) => image.remove());

    const lines = (clone.textContent || "")
      .split(/\n+/)
      .map(cleanText)
      .filter(Boolean);

    if (lines.length === 0) {
      return images.length ? [{ text: "", images }] : [];
    }

    return lines.map((line, index) => ({
      text: line,
      images: index === lines.length - 1 ? images : []
    }));
  });
}
