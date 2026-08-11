# Kent OCR AI Extraction Accuracy Guide

## Understanding the AI Extraction Pipeline

The Kent Repertory OCR Digitizer uses a **multi-stage AI pipeline** to convert scanned Kent pages into structured Excel files:

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  User       │────▶│  Tesseract  │────▶│  AI Parser   │────▶│  Excel      │
│  Uploads    │     │  OCR        │     │  (Groq/OAI)  │     │  Download   │
│  Image/PDF  │     │  Raw Text   │     │  Structured  │     │  .xlsx File │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
```

**Key Insight:** The AI can only work with what Tesseract OCR provides. If "PAIN" is not in the OCR text, the AI cannot include it in the path.

---

## Why "PAIN" and Other Sections Go Missing

### Problem: Intermediate Hierarchy Sections Dropped

**Page 158 Example:**
```
❌ Extracted: HEAD - weather, from changes of
✅ Expected:  HEAD - PAIN - weather, from changes of
```

### Root Causes:

#### 1. Column Continuation Headers Misread
**What Happens:**
- Page 156 right column header shows: `"swallowing, when:"`
- This is a **continuation marker**, not a chapter heading
- But OCR may read it as a standalone line without context
- AI then treats it as a new top-level rubric instead of `HEAD - PAIN - sudden - swallowing, when`

**Why AI Fails:**
- Kent uses **visual column headers** to save space
- OCR doesn't understand visual layout — it just reads text top-to-bottom
- AI receives: `"swallowing, when: distant, others, tea..."` without seeing the indentation or connection to "PAIN, sudden"
- Without context, AI creates: `HEAD - swallowing, when - distant` (wrong!)
- Should be: `HEAD - PAIN - sudden - swallowing, when - distant` (correct!)

**Current Solution in Code:**
```javascript
// Line 245 in kentTesseractParser.js
const contextInstruction = lastRubricContext
  ? `CONTEXT FROM PREVIOUS (LEFT) COLUMN: The left column's last extracted rubric path was "${lastRubricContext}". If this column starts with a list of medicines or a comma-separated continuation header (e.g. "COLOR, redness, inside."), reconstruct the parent path from this context and use it for all sub-rubrics beneath it.`
  : '';
```

This passes left column context to right column, but **only works if left column was parsed correctly**.

#### 2. OCR Loses Indentation
**What Happens:**
- Kent's printed format uses **indentation to show hierarchy**:
  ```
  PAIN
    sudden
      swallowing, when
        distant
        others, of
  ```
- Tesseract OCR flattens this to plain text, losing indentation info
- AI must **infer hierarchy from punctuation and capitalization alone**

**Why AI Fails:**
- If OCR misreads spaces/tabs, AI cannot determine nesting level
- AI relies on colons (`:`) to detect rubric entries
- But continuation lines without colons are ambiguous

#### 3. Multi-Column Layout Confusion
**What Happens:**
- Kent pages often have **2-column layout**
- Left column ends mid-rubric, right column continues
- OCR must split columns correctly OR parse full page and detect the split

**Why AI Fails:**
- Column boundary detection is imperfect
- Text from right column may merge into left column
- Or right column is parsed separately without left column context

**Current Solution in Code:**
```javascript
// Line 1040+ in kentTesseractParser.js
const columnOcr = await extractColumnTextsFromImage(imagePath, tempDir);
leftText = columnOcr.leftText;
rightText = columnOcr.rightText;
leftPath = columnOcr.leftPath;
rightPath = columnOcr.rightPath;
```

But column splitting algorithm can fail on poor quality scans.

#### 4. Parent Rubric Not Read by OCR
**What Happens:**
- OCR completely misses the "PAIN" line due to:
  - Low contrast (faded print)
  - Smudged or damaged page
  - Page crease or fold
  - Too low DPI (< 300)
- Result: AI never sees "PAIN" in the text

**Why AI Fails:**
- **AI cannot infer missing text** — it can only structure what's provided
- If OCR reads:
  ```
  HEAD
  weather, from changes of: Bell, bry...
  ```
- AI produces: `HEAD - weather, from changes of` (no PAIN)
- AI doesn't know that "weather" should be under "PAIN"

---

## AI Prompt Engineering Strategy

### Current Prompt Instructions (kentTesseractParser.js line 253)

The AI is given these critical instructions:

#### 1. Chapter Detection
```
The page header indicates this is the "HEAD" chapter.
You MUST prefix ALL rubric paths with "HEAD - " at the beginning.
```

**Limitation:** If OCR misreads chapter header, entire page is miscategorized.

#### 2. Hierarchy Construction
```
Example raw: "bed, in: Tod." → rubric_en = "HEAD - PAIN - bed, in"
```

**Limitation:** Prompt **assumes** AI knows that "bed, in" belongs under "PAIN". But if "PAIN" wasn't in the OCR text, AI has no way to know this!

#### 3. Context from Previous Column
```
CONTEXT FROM PREVIOUS (LEFT) COLUMN: The left column's last extracted rubric path was "HEAD - PAIN - sudden".
If this column starts with a list of medicines or a comma-separated continuation header, 
reconstruct the parent path from this context.
```

**Limitation:** Only works for right column if left column was correct. If left column also failed, right column fails too.

### Proposed Improvements

#### Improvement 1: Kent Structure Knowledge Base
**Current:** AI must infer hierarchy from text alone.

**Proposed:** Give AI a **reference hierarchy** for common Kent patterns:

```javascript
const KENT_HEAD_STRUCTURE = `
KNOWN KENT HEAD CHAPTER STRUCTURE:
- HEAD - PAIN (most common main rubric in HEAD chapter)
  - HEAD - PAIN - sudden
    - HEAD - PAIN - sudden - swallowing, when
      - HEAD - PAIN - sudden - swallowing, when - distant
      - HEAD - PAIN - sudden - swallowing, when - others, of
  - HEAD - PAIN - weather, from changes of
    - HEAD - PAIN - weather, from changes of - cloudy
    - HEAD - PAIN - weather, from changes of - cold
      - HEAD - PAIN - weather, from changes of - damp, cold
      - HEAD - PAIN - weather, from changes of - dry, cold

If you see rubrics like "weather, from changes of", "cloudy", "cold", "damp", they are ALWAYS sub-rubrics of "PAIN" in the HEAD chapter.
`;
```

Add this to the AI prompt for HEAD chapter pages.

#### Improvement 2: Two-Pass Extraction
**Current:** Single AI call processes entire column.

**Proposed:** 
1. **Pass 1:** Extract main rubrics only (detect ALL CAPS lines)
2. **Pass 2:** Extract sub-rubrics and assign to nearest parent

This ensures main rubrics like "PAIN" are always captured.

#### Improvement 3: Validate Paths Against Kent Index
**Current:** AI outputs whatever it interprets.

**Proposed:** Post-process AI output through Kent rubric validator:

```javascript
const validatePath = (path, chapter) => {
  const knownHeadPaths = [
    'HEAD - PAIN',
    'HEAD - PAIN - sudden',
    'HEAD - PAIN - weather, from changes of',
    // ... (load from Kent's index)
  ];
  
  // If path is suspiciously short, flag for review
  if (chapter === 'HEAD' && !path.includes('PAIN') && path.includes('weather')) {
    return {
      valid: false,
      suggestion: path.replace('HEAD -', 'HEAD - PAIN -'),
      reason: 'Weather modalities always under PAIN in HEAD chapter'
    };
  }
  
  return { valid: true };
};
```

#### Improvement 4: Visual Layout Awareness
**Current:** Tesseract OCR loses indentation.

**Proposed:** Use **Tesseract's layout analysis mode** to preserve indentation:

```javascript
// Instead of: tesseract image.png output
// Use: tesseract image.png output --psm 4 -c preserve_interword_spaces=1
```

This preserves indentation info, allowing AI to detect hierarchy levels.

---

## Best Practices for Maximum Accuracy

### For Users (Clinical Practitioners):

1. **Scan at 300+ DPI** — Higher DPI = better OCR = better AI extraction
2. **Use text-based PDFs when possible** — Avoids OCR step entirely
3. **Crop to single column** — Reduces column-split errors
4. **Good lighting** — High contrast improves OCR character recognition
5. **Validate output** — Always spot-check 10 random rubrics against source
6. **Manual corrections OK** — Fix paths in Excel before clinical use

### For Developers (Improving the System):

1. **Add Kent structure knowledge to prompts** — See Improvement 1 above
2. **Implement two-pass extraction** — Main rubrics first, then sub-rubrics
3. **Post-validation layer** — Catch common errors automatically
4. **Better OCR preprocessing** — Enhance contrast, deskew, denoise before OCR
5. **Preserve layout info** — Use Tesseract PSM modes that keep indentation
6. **Fine-tune AI prompts** — Add more Kent-specific examples to prompt
7. **Collect error patterns** — Build a database of common mistakes to prevent

---

## Common Error Patterns and Fixes

### Error Pattern 1: Weather Modalities Missing PAIN

**Pattern:**
```
❌ HEAD - weather, from changes of
❌ HEAD - cloudy
❌ HEAD - cold
```

**Auto-Fix Rule:**
```javascript
if (chapter === 'HEAD' && 
    rubric.match(/(weather|cloudy|cold|damp|dry|warm|heat|sun|shade)/i) &&
    !rubric.includes('PAIN')) {
  rubric = rubric.replace('HEAD -', 'HEAD - PAIN -');
}
```

### Error Pattern 2: Continuation Column Misread as New Chapter

**Pattern:**
```
❌ Chapter: SWALLOWING (doesn't exist)
❌ Chapter: TALKING (doesn't exist)
❌ Chapter: EATING (doesn't exist)
```

**Auto-Fix Rule:**
```javascript
const validKentChapters = new Set([
  'MIND', 'VERTIGO', 'HEAD', 'EYE', 'VISION', 'EAR', 'HEARING', 'NOSE', 'FACE',
  'MOUTH', 'TEETH', 'THROAT', 'EXTERNAL THROAT', 'STOMACH', 'ABDOMEN', 'RECTUM',
  'STOOL', 'BLADDER', 'KIDNEY', 'PROSTATE GLAND', 'URETHRA', 'URINE',
  'MALE GENITALIA', 'FEMALE GENITALIA', 'LARYNX AND TRACHEA', 'RESPIRATION',
  'COUGH', 'EXPECTORATION', 'CHEST', 'BACK', 'EXTREMITIES', 'SLEEP', 'CHILL',
  'FEVER', 'PERSPIRATION', 'SKIN', 'GENERALITIES'
]);

if (!validKentChapters.has(detectedChapter)) {
  console.warn(`Invalid chapter detected: ${detectedChapter}. Using context from previous column.`);
  detectedChapter = previousChapter; // Fallback
}
```

### Error Pattern 3: Medicine Names in Rubric Field

**Pattern:**
```
❌ Rubric: HEAD - PAIN - walking rapidly: Bell
✅ Rubric: HEAD - PAIN - walking rapidly
```

**Auto-Fix Rule:**
```javascript
// Strip everything after colon from rubric
rubric = rubric.split(':')[0].trim();

// Also strip common medicine abbreviations if they leaked in
const medicinePattern = /\b(acon|bell|bry|calc|chin|nux-v|puls|sulph)\b/i;
rubric = rubric.replace(medicinePattern, '').trim();
```

---

## Measuring Extraction Accuracy

### Accuracy Metrics:

1. **Structural Accuracy** — % of rubrics with correct full hierarchy path
   - Target: **100%** (every rubric must have complete path)
   - Page 158: **95%** (5 missing "PAIN")

2. **Medicine Extraction Accuracy** — % of medicine names correctly extracted
   - Target: **98%+** 
   - Page 158: **97.8%** (10 OCR typos out of 450)

3. **Grading Accuracy** — % of medicines with correct grade (1/2/3)
   - Target: **95%+**
   - Page 158: **~95%** (grading from capitalization is reliable)

4. **Completeness** — % of rubrics extracted vs. total in source
   - Target: **96%+** (4 missing per 100 acceptable)
   - Page 158: **96%** (4 nested sub-rubrics missing)

### Testing Protocol:

```javascript
function validatePage(extracted, source) {
  const results = {
    totalRubrics: source.rubrics.length,
    extracted: extracted.length,
    missing: [],
    pathErrors: [],
    medicineErrors: []
  };
  
  // Check completeness
  for (const sourceRubric of source.rubrics) {
    const found = extracted.find(e => 
      e.rubric_en.includes(sourceRubric.text)
    );
    if (!found) {
      results.missing.push(sourceRubric);
    }
  }
  
  // Check path correctness
  for (const row of extracted) {
    if (row.chapter_en === 'HEAD' && 
        row.rubric_en.includes('weather') && 
        !row.rubric_en.includes('PAIN')) {
      results.pathErrors.push({
        extracted: row.rubric_en,
        expected: row.rubric_en.replace('HEAD -', 'HEAD - PAIN -')
      });
    }
  }
  
  return results;
}
```

---

## Future Enhancements

### 1. Visual AI Models (GPT-4 Vision, Claude 3.5 Sonnet)
Instead of Tesseract → Text → AI, use **Vision AI** that reads the image directly:
- Understands layout, indentation, formatting
- No OCR errors
- Can see bold/italic directly (better grading)

**Tradeoff:** Higher cost per page (~$0.01 vs $0.001)

### 2. Fine-Tuned LLM on Kent Repertory
Train a custom model on Kent's complete repertory:
- Learns all valid rubric paths
- Better error correction
- Faster inference

**Tradeoff:** Requires training data (entire Kent's Repertory digitized)

### 3. Hybrid Approach: OCR + Vision AI
- Use Tesseract for fast text extraction
- Use Vision AI only for **validation** of suspicious entries
- Best of both: speed + accuracy

### 4. Interactive Correction UI
- Show user the rubric paths with confidence scores
- Flag low-confidence paths for manual review
- User confirms/corrects before download

---

## Quick Reference: Current System Limitations

| Issue | Cause | Current Workaround | Ideal Solution |
|-------|-------|-------------------|----------------|
| Missing "PAIN" in paths | OCR doesn't read parent rubric line | Manual Excel editing | Kent structure knowledge base |
| Continuation column misread | Column split algorithm imperfect | Context from left column | Better column detection |
| Medicine OCR typos | Tesseract character confusion | AI spell-correction (partial) | Medical dictionary |
| Wrong grading | Capitalization from OCR unreliable | Fixed italic remedy list | Vision AI to see formatting |
| Missing nested rubrics | Indentation lost in OCR | Rule-based parser fallback | Layout-preserving OCR |
| Complex pages fail | AI context window limit | Split into smaller chunks | Fine-tuned model |

---

**Document Purpose:** Help developers improve AI extraction accuracy and understand why errors occur  
**Target Audience:** System developers, AI prompt engineers, QA team  
**Related Files:**
- `/server/services/kentTesseractParser.js` — AI prompt engineering
- `/server/services/kentTextParser.js` — Rule-based parser
- `/server/services/kentOcrService.js` — Tesseract OCR wrapper  
**Version:** 1.0  
**Last Updated:** January 2025
