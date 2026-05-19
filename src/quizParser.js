const CHOICE_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const CHOICE_MARKER_RE = /([A-H])\s*[.)：:\-]\s*/gu;
const OPTION_MARKER_RE = /Option\s+([A-H])\s*/gu;
const ANSWER_KEY_PAIR_RE = /(?:cau|question|q)?\s*(\d{1,3})\s*[.)：:\-]?\s*([A-Ha-h](?:[\s,;/]+[A-Ha-h])*)\b/gu;

function cleanLine(line) {
  return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function removeDiacritics(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalized(value) {
  return removeDiacritics(value).toLowerCase();
}

function stripCorrectMarks(text) {
  return text
    .replace(/^[*✓✔✅]+\s*/u, "")
    .replace(/\s*[*✓✔✅]+$/u, "")
    .replace(/\s*\((?:correct|right|true|dung|dap an dung)\)\s*$/iu, "")
    .trim();
}

function asItems(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => ({ text: cleanLine(line), images: [] }))
    .filter((item) => item.text || item.images.length);
}

function matchQuestion(line) {
  const value = normalized(line);
  const patterns = [
    /^(?:cau|question|questions|q)\s*(\d{1,3}(?:\.\d{1,3})?)\s*[.)：:\-]?\s*/u,
    /^(\d{1,3})\s*[.)：:\-]\s+/u
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return {
        number: Number(match[1]),
        text: line.slice(match[0].length).trim()
      };
    }
  }

  return null;
}

function hasExplicitQuestionPrefix(line) {
  return /^(?:câu|cau|question|questions|q)\s*\d/iu.test(line);
}

function isExplanationLine(line) {
  const value = normalized(line);
  return /^(?:explanation|giai\s*thich|reference|references?)\b/u.test(value);
}

function looksLikeQuestionText(line) {
  const value = normalized(line);
  return (
    line.includes("?") ||
    /^(?:which|what|how|why|when|where|who|an?|the|a network|a user|an administrator)\b/u.test(value)
  );
}

function matchSingleAnswer(line) {
  const value = normalized(line);
  const patterns = [
    /^(?:dap\s*an|dap\s*an\s*dung|answer|correct\s*answer|correct|ans|key)\s*[:：\-]?\s*([a-h](?:[\s,;/]+[a-h])*)\b/u,
    /^(?:=>|->)\s*([a-h](?:[\s,;/]+[a-h])*)\b/u,
    /^([a-h](?:[\s,;/]+[a-h])*)\s*(?:la\s*dap\s*an|is\s*correct)\b/u
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return parseAnswerLetters(match[1]);
  }

  return [];
}

function parseAnswerLetters(value) {
  return [...new Set((value.match(/[a-h]/giu) || []).map((letter) => letter.toUpperCase()))];
}

function parseAnswerKeyLine(line) {
  const value = normalized(line);
  const isAnswerKeyLine =
    /^(?:bang\s*)?(?:dap\s*an|answer\s*key|answers?|key)\b/u.test(value) ||
    /^(?:\d{1,3}\s*[.)：:\-]?\s*[a-d]\b\s*){2,}$/u.test(value);

  if (!isAnswerKeyLine) return [];

  const pairs = [];
  for (const match of value.matchAll(ANSWER_KEY_PAIR_RE)) {
    pairs.push({
      number: Number(match[1]),
      answers: parseAnswerLetters(match[2])
    });
  }
  return pairs;
}

function parseChoicesFromLine(line) {
  const markers = [];
  const markerRe = /^Option\s+[A-H]/u.test(line) ? OPTION_MARKER_RE : CHOICE_MARKER_RE;
  const seenLabels = new Set();

  for (const match of line.matchAll(markerRe)) {
    const label = match[1];
    if (seenLabels.has(label.toUpperCase())) continue;
    seenLabels.add(label.toUpperCase());
    markers.push({
      label: label.toUpperCase(),
      start: match.index,
      contentStart: match.index + match[0].length
    });
  }

  if (markers.length === 0) return null;

  const prefix = line.slice(0, markers[0].start).trim();
  const choices = markers.map((marker, index) => {
    const rawText = line.slice(marker.contentStart, markers[index + 1]?.start ?? line.length).trim();
    const markedCorrect =
      /^[*✓✔✅]/u.test(rawText) ||
      /[*✓✔✅]\s*$/u.test(rawText) ||
      /\((?:correct|right|true|dung|dap an dung)\)\s*$/iu.test(rawText);

    return {
      label: marker.label,
      text: stripCorrectMarks(rawText),
      markedCorrect,
      images: []
    };
  });

  return { prefix, choices };
}

function newDraft(number, questionText, images = []) {
  return {
    number,
    questionParts: questionText ? [questionText] : [],
    questionImages: [...images],
    choices: new Map(),
    correctAnswers: []
  };
}

function draftToManualNote(draft, reason) {
  const choices = CHOICE_LABELS
    .filter((label) => draft.choices.has(label))
    .map((label) => {
      const choice = draft.choices.get(label);
      return {
        label,
        text: choice.textParts.join(" ").trim(),
        images: choice.images
      };
    });

  return {
    number: draft.number,
    reason,
    question: draft.questionParts.join(" ").trim(),
    images: draft.questionImages,
    choices,
    correctAnswers: draft.correctAnswers
  };
}

function getChoice(draft, label) {
  if (!draft.choices.has(label)) {
    draft.choices.set(label, { textParts: [], images: [] });
  }
  return draft.choices.get(label);
}

function appendChoice(draft, choice) {
  const existing = getChoice(draft, choice.label);
  const existingText = existing.textParts.join(" ").trim();
  const nextText = choice.text.trim();

  if (existingText && /^Option\s+[A-H]$/u.test(nextText)) {
    return;
  }

  if (choice.text) existing.textParts.push(choice.text);
  if (choice.images?.length) existing.images.push(...choice.images);

  if (choice.markedCorrect) {
    draft.correctAnswers = [...new Set([...draft.correctAnswers, choice.label])];
  }
}

function appendImages(draft, activeChoice, images) {
  if (!images?.length) return;
  if (activeChoice) {
    getChoice(draft, activeChoice).images.push(...images);
  } else {
    draft.questionImages.push(...images);
  }
}

function applyInlineChoices(draft, item, activeChoice) {
  const parsed = parseChoicesFromLine(item.text);
  if (!parsed) return { handled: false, activeChoice };

  if (parsed.prefix) {
    if (activeChoice) {
      appendChoice(draft, { label: activeChoice, text: parsed.prefix, markedCorrect: false });
    } else {
      draft.questionParts.push(parsed.prefix);
    }
  }

  let nextActiveChoice = activeChoice;
  for (const choice of parsed.choices) {
    appendChoice(draft, choice);
    nextActiveChoice = choice.label;
  }

  appendImages(draft, nextActiveChoice, item.images);
  return { handled: true, activeChoice: nextActiveChoice };
}

function collectAnswerKey(items) {
  const answerKey = new Map();

  for (const item of items) {
    for (const pair of parseAnswerKeyLine(item.text)) {
      const validAnswers = pair.answers.filter((answer) => CHOICE_LABELS.includes(answer));
      if (validAnswers.length) {
        answerKey.set(pair.number, validAnswers);
      }
    }
  }

  return answerKey;
}

function applyAnswerKey(draft, answerKey) {
  if (draft.correctAnswers.length === 0 && answerKey.has(draft.number)) {
    draft.correctAnswers = answerKey.get(draft.number);
  }
}

function finishDraft(draft, parsedIndex, answerKey) {
  applyAnswerKey(draft, answerKey);

  const warnings = [];
  const question = draft.questionParts.join(" ").trim();

  if (!question && draft.questionImages.length === 0) {
    warnings.push(`Câu ${draft.number}: thiếu nội dung câu hỏi.`);
  }

  const availableLabels = CHOICE_LABELS.filter((label) => draft.choices.has(label));

  if (availableLabels.length < 2 && draft.correctAnswers.length === 0) {
    return {
      question: null,
      warnings: [],
      manualNote: draftToManualNote(draft, "Không đủ lựa chọn A/B/C hoặc không có đáp án đúng.")
    };
  }

  if (availableLabels.length < 2) {
    warnings.push(`Câu ${draft.number}: cần ít nhất 2 đáp án lựa chọn.`);
  }

  for (const label of availableLabels) {
    const choice = draft.choices.get(label);
    if (!choice || (!choice.textParts.join(" ").trim() && choice.images.length === 0)) {
      warnings.push(`Câu ${draft.number}: thiếu đáp án ${label}.`);
    }
  }

  const validCorrectAnswers = draft.correctAnswers.filter((answer) => availableLabels.includes(answer));

  if (validCorrectAnswers.length === 0) {
    warnings.push(`Câu ${draft.number}: thiếu đáp án đúng. Hỗ trợ: "Đáp án: B", "Answer: B D", "*B.", hoặc bảng đáp án cuối file.`);
  }

  if (warnings.length > 0) {
    return {
      question: null,
      warnings,
      manualNote: draftToManualNote(draft, warnings.join(" "))
    };
  }

  return {
    question: {
      id: `q-${parsedIndex + 1}-${crypto.randomUUID?.() || Date.now()}`,
      question,
      images: draft.questionImages,
      choices: availableLabels.map((label) => {
        const choice = draft.choices.get(label);
        return {
          label,
          text: choice.textParts.join(" ").trim(),
          images: choice.images
        };
      }),
      correctAnswers: validCorrectAnswers,
      correctAnswer: validCorrectAnswers[0] || ""
    },
    warnings,
    manualNote: null
  };
}

export function parseQuizItems(rawItems) {
  const items = rawItems
    .map((item) => ({
      text: cleanLine(item.text || ""),
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : []
    }))
    .filter((item) => item.text || item.images.length);

  const answerKey = collectAnswerKey(items);
  const questions = [];
  const warnings = [];
  const manualNotes = [];
  let draft = null;
  let activeChoice = "";
  let fallbackQuestionNumber = 0;
  let ignoreUntilNextQuestion = false;

  function flush() {
    if (!draft) return;
    const result = finishDraft(draft, questions.length, answerKey);
    warnings.push(...result.warnings);
    if (result.question) questions.push(result.question);
    if (result.manualNote) manualNotes.push(result.manualNote);
    draft = null;
    activeChoice = "";
    ignoreUntilNextQuestion = false;
  }

  for (const item of items) {
    if (item.text && parseAnswerKeyLine(item.text).length > 0) {
      continue;
    }

    const questionMatch = item.text ? matchQuestion(item.text) : null;
    if (questionMatch) {
      if (ignoreUntilNextQuestion && !hasExplicitQuestionPrefix(item.text)) {
        continue;
      }
      flush();
      fallbackQuestionNumber += 1;
      draft = newDraft(questionMatch.number || fallbackQuestionNumber, questionMatch.text, item.images);
      activeChoice = "";
      ignoreUntilNextQuestion = false;

      const inline = applyInlineChoices(draft, { text: questionMatch.text, images: [] }, activeChoice);
      if (inline.handled) {
        const parsed = parseChoicesFromLine(questionMatch.text);
        draft.questionParts = parsed?.prefix ? [parsed.prefix] : [];
        activeChoice = inline.activeChoice;
      }
      continue;
    }

    if (!draft) continue;

    if (ignoreUntilNextQuestion) continue;

    if (!item.text && item.images.length) {
      appendImages(draft, activeChoice, item.images);
      continue;
    }

    const singleAnswer = matchSingleAnswer(item.text);
    if (singleAnswer.length > 0) {
      draft.correctAnswers = singleAnswer;
      appendImages(draft, activeChoice, item.images);
      activeChoice = "";
      ignoreUntilNextQuestion = true;
      continue;
    }

    if (isExplanationLine(item.text)) {
      ignoreUntilNextQuestion = true;
      continue;
    }

    const inline = applyInlineChoices(draft, item, activeChoice);
    if (inline.handled) {
      activeChoice = inline.activeChoice;
      continue;
    }

    if (activeChoice) {
      if (looksLikeQuestionText(item.text)) {
        draft.questionParts.push(item.text);
        draft.questionImages.push(...item.images);
        continue;
      }

      appendChoice(draft, {
        label: activeChoice,
        text: item.text,
        images: item.images,
        markedCorrect: false
      });
    } else {
      draft.questionParts.push(item.text);
      draft.questionImages.push(...item.images);
    }
  }

  flush();

  if (questions.length === 0 && warnings.length === 0) {
    warnings.push("Không tìm thấy câu hỏi. Hỗ trợ: Câu 1, Question 1, Q1, hoặc 1. kèm đáp án A/B/C/D.");
  }

  return { questions, warnings, manualNotes };
}

export function parseQuizText(rawText) {
  return parseQuizItems(asItems(rawText));
}

export function shuffleQuestions(questions) {
  const result = [...questions];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
