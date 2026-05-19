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
