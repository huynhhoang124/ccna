import { formatReadableLines, isCodeLine } from "../utils.js";

export default function RichText({ text, className = "" }) {
  const lines = formatReadableLines(text || "");
  const groups = [];

  for (const line of lines) {
    const type = isCodeLine(line) ? "code" : "text";
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.type === type) {
      lastGroup.lines.push(line);
    } else {
      groups.push({ type, lines: [line] });
    }
  }

  return (
    <div className={className}>
      {groups.map((group, index) =>
        group.type === "code" ? (
          <pre className="codeBlock" key={`${group.type}-${index}`}>
            {group.lines.join("\n")}
          </pre>
        ) : (
          <div className="textBlock" key={`${group.type}-${index}`}>
            {group.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )
      )}
    </div>
  );
}
