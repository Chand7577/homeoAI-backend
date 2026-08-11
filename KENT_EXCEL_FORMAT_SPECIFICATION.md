# Kent Repertory Excel Format Specification

## Document Purpose
This document defines the **exact Excel format** produced by the Kent Repertory OCR Digitizer tool. The tool performs **client-side OCR extraction** directly in the browser, processes Kent Repertory scanned pages using AI (Groq/OpenAI), and generates downloadable Excel files with structured rubric data.

**Important:** These Excel files are **NOT imported into a database** - they are directly downloaded from the browser for immediate use by practitioners.

---

## Critical Rule: Full Hierarchy Paths Required

**⚠️ MOST IMPORTANT:** The `Rubric (English)` column MUST contain the **complete hierarchical path** including ALL intermediate sections.

### ✅ Correct Examples:
```
HEAD - PAIN - walking rapidly
HEAD - PAIN - sudden - swallowing, when
HEAD - PAIN - weather, from changes of
MIND - FEAR - alone, of being
ABDOMEN - PAIN - cramping - stool, before
```

### ❌ Incorrect Examples (Missing Hierarchy):
```
HEAD - walking rapidly           ❌ Missing "PAIN"
HEAD - weather, from changes of  ❌ Missing "PAIN"
MIND - alone, of being          ❌ Missing "FEAR"
ABDOMEN - cramping - stool      ❌ Missing "PAIN"
```

---

## Excel Column Structure

### Required Columns (Standard Format)

| Column Name | Description | Example | Rules |
|------------|-------------|---------|-------|
| **Chapter (English)** | Main chapter name only | `HEAD` | Single word/phrase, not full path |
| **Chapter (Hindi)** | Hindi translation | `सिर` | Optional but recommended |
| **Rubric (English)** | **FULL hierarchical path** | `HEAD - PAIN - walking rapidly` | MUST include all sections separated by ` - ` |
| **Rubric (Hindi)** | Hindi translation of full path | `सिर - दर्द - तेज चलने पर` | Optional but recommended |
| **Medicine** | Medicine abbreviation | `Bell`, `nux-v`, `calc` | Exact case-sensitive abbreviation |
| **Grading** or **Grade** | Intensity grade | `1`, `2`, or `3` | Integer 1-3 only |

---

## Format Rules by Section

### 1. Chapter Field
- Contains **only the main chapter name**
- Examples: `HEAD`, `MIND`, `ABDOMEN`, `EXTREMITIES`
- NOT the full path
- Forward-fills to next row if empty (carries previous chapter)

### 2. Rubric Field - THE CRITICAL FIELD

#### Path Construction Rules:
The Rubric (English) field MUST follow this pattern:

```
[CHAPTER] - [SECTION] - [SUB-SECTION] - [SUB-SUB-SECTION] - ...
```

#### Multi-Level Hierarchy Examples:

**HEAD - PAIN Section (Page 156-158):**
```
HEAD - PAIN - sudden
HEAD - PAIN - sudden - go, must
HEAD - PAIN - sudden - decreasing gradually
HEAD - PAIN - sudden - micturition, during
HEAD - PAIN - sudden - syphilitic
HEAD - PAIN - sudden - talking, while, agg.
HEAD - PAIN - sudden - swallowing, when
HEAD - PAIN - sudden - swallowing, when - distant
HEAD - PAIN - sudden - swallowing, when - others, of
HEAD - PAIN - sudden - swallowing, when - tea, from
HEAD - PAIN - weather, from changes of
HEAD - PAIN - weather, from changes of - cloudy
HEAD - PAIN - weather, from changes of - cold
HEAD - PAIN - weather, from changes of - damp, cold
```

**MIND Section Examples:**
```
MIND - FEAR
MIND - FEAR - alone, of being
MIND - FEAR - alone, of being - night
MIND - FEAR - crowd, in a
MIND - DELUSIONS
MIND - DELUSIONS - pursued, is
MIND - DELUSIONS - pursued, is - enemies, by
```

#### Common OCR Errors to Avoid:

| ❌ Wrong Path | ✅ Correct Path | Issue |
|--------------|----------------|-------|
| `HEAD - walking rapidly` | `HEAD - PAIN - walking rapidly` | Missing "PAIN" section |
| `HEAD - weather, from changes of` | `HEAD - PAIN - weather, from changes of` | Missing "PAIN" section |
| `SWALLOWING - when` | `HEAD - PAIN - sudden - swallowing, when` | Wrong chapter + missing hierarchy |
| `MIND - alone, of being` | `MIND - FEAR - alone, of being` | Missing "FEAR" section |
| `talking, while, agg.` | `HEAD - PAIN - sudden - talking, while, agg.` | Missing all parent sections |

### 3. Medicine Field
- Standard homeopathic medicine abbreviations
- Case-sensitive (preferably lowercase with hyphens)
- Examples: `bell`, `nux-v`, `calc`, `am-c`, `kali-c`, `nat-m`

#### Common Medicine OCR Errors:

| ❌ OCR Output | ✅ Correct | Notes |
|--------------|-----------|-------|
| `Aun-c` | `am-c` | Ammonium carbonicum |
| `nux-n` | `nux-v` | Nux vomica |
| `ant-t` | `ant-c` | Antimonium crudum |
| `clin` | `chin` | China officinalis |
| `An-c` | `am-c` | Ammonium carbonicum |
| `carb-ani` | `carb-an` | Carbo animalis |
| `cinic` | `chin` | China officinalis |
| `nuang` | `mang` | Manganum |
| `ziing` | `zing` | Zingiber |
| `wct` | `wet` | (context dependent) |

### 4. Grading Field
- Values: `1`, `2`, or `3` only
- Grade 1: Remedy present in repertory
- Grade 2: Remedy marked with moderate emphasis
- Grade 3: Remedy marked with strong emphasis (bold/italic in original)

---

## Row Structure Format

### One Row Per Medicine Entry
Each row represents **one medicine** for **one rubric**.

**Example: Multiple medicines for same rubric**

| Chapter (English) | Rubric (English) | Medicine | Grading |
|-------------------|------------------|----------|---------|
| HEAD | HEAD - PAIN - walking rapidly | Bell | 1 |
| HEAD | HEAD - PAIN - walking rapidly | bry | 1 |
| HEAD | HEAD - PAIN - walking rapidly | nux-v | 2 |

**NOT like this:**
```
❌ One row with all medicines in one cell
HEAD | HEAD - PAIN - walking rapidly | Bell, bry, nux-v | 1,1,2
```

---

## Special Cases and Edge Cases

### 1. Cross-References
Cross-references like `(See 'air')` should be treated as **text notes**, not medicine entries.

**Handling:**
- Option A: Skip the row (preferred)
- Option B: Add a notes/comments column
- Do NOT treat as medicine name

### 2. Continuation Headers
When a section continues across columns or pages, the continuation header (e.g., "swallowing, when:" at top of right column) is **NOT a new chapter**.

**Example from Page 156:**
- Right column header: "swallowing, when:" 
- This is a **sub-rubric continuation** of `HEAD - PAIN - sudden - swallowing, when`
- NOT a new "SWALLOWING" chapter

### 3. Forward-Filling Context
The import system supports forward-filling:
- Empty Chapter cell → carries forward previous chapter
- Empty Rubric main section → carries forward previous rubric context

**But:** This should be used sparingly. **Explicit full paths are always better.**

### 4. Complex Descriptive Rubrics
Some rubrics have long descriptive text that might span visual lines in the PDF.

**Example from Page 158:**
```
✅ Correct (one rubric):
HEAD - PAIN - mist before eyes | Podo | 2

❌ Wrong (split into multiple rows):
HEAD - PAIN - mist | (incomplete)
HEAD - PAIN - before | (incomplete)
HEAD - PAIN - eyes | (incomplete)
```

Keep the full descriptive text together as one rubric entry.

---

## Validation Checklist

Before importing Kent Repertory Excel data, verify:

- [ ] **All rubric paths are complete** (include all hierarchy levels like PAIN, FEAR, etc.)
- [ ] **Chapter field contains only main chapter name** (not full path)
- [ ] **Rubric field contains full hierarchical path** starting with chapter name
- [ ] **Medicine abbreviations are correct** (check common OCR errors)
- [ ] **Grades are 1, 2, or 3 only** (no text, no decimals)
- [ ] **One row per medicine entry** (not one row per rubric)
- [ ] **Cross-references are not treated as medicines**
- [ ] **Continuation headers are properly interpreted as sub-rubrics**
- [ ] **Hindi translations are accurate** (if provided)

---

## System Processing Logic

### OCR → AI Extraction → Excel Flow:
1. **User uploads** scanned image/PDF of Kent Repertory page
2. **Tesseract OCR** extracts raw text from the image
3. **AI Parser** (Groq Llama 3.3 or OpenAI GPT-4o-mini) structures the text:
   - Identifies chapter from page header
   - Detects rubric hierarchy from indentation/formatting
   - **Constructs full paths** including intermediate sections (e.g., "PAIN")
   - Extracts medicine names and assigns grading based on typography
   - Translates to Hindi
4. **Excel Generator** creates downloadable .xlsx file
5. **Browser downloads** the file directly (no database storage)

---

## Page 158 Specific Issues (Reference)

### Identified Issues from Validation:

**1. Missing "PAIN" in hierarchy (5 rubrics):**
```
❌ HEAD - weather, from changes of
✅ HEAD - PAIN - weather, from changes of

❌ HEAD - cloudy
✅ HEAD - PAIN - weather, from changes of - cloudy

❌ HEAD - cold
✅ HEAD - PAIN - weather, from changes of - cold

❌ HEAD - damp, cold
✅ HEAD - PAIN - weather, from changes of - damp, cold

❌ HEAD - dry, cold
✅ HEAD - PAIN - weather, from changes of - dry, cold
```

**2. Medicine OCR errors (10 instances):**
See "Common Medicine OCR Errors" table above.

**3. Complex rubric split error:**
```
❌ Split into 5 rows:
HEAD - PAIN - mist
HEAD - PAIN - before
HEAD - PAIN - eyes
(etc.)

✅ Should be one entry:
HEAD - PAIN - mist before eyes | Podo | 2
```

---

## Target Accuracy

**Validation Standard:** 96%+ accuracy per page
- Structural accuracy: 100% (all rubrics must have correct hierarchy)
- Medicine OCR accuracy: 95%+ (minor abbreviation corrections acceptable)
- Missing rubrics: <4 per 100 rubrics (only deeply nested sub-sub-rubrics)

---

## Additional Resources

- **Frontend Component:** `/src/components/KentOCRTab.jsx` (browser UI)
- **OCR Service:** `/server/services/kentOcrService.js` (Tesseract extraction)
- **AI Parser:** `/server/services/kentTesseractParser.js` (Groq/OpenAI prompt engineering)
- **Text Parser:** `/server/services/kentTextParser.js` (rule-based fallback parser)
- **Excel Generator:** `/server/services/kentExcelGenerator.js` (creates .xlsx files)
- **API Routes:** `/server/routes/kentOcrRoutes.js` (upload endpoints)

### Key AI Prompt Instructions (from kentTesseractParser.js line 253):
The AI is instructed to:
1. Build full hierarchy paths including ALL intermediate sections
2. Example: `"bed, in: Tod."` → `"HEAD - PAIN - bed, in"` (includes "PAIN")
3. Detect grading from capitalization (Capital = Grade 3, lowercase = Grade 1/2)
4. Fix common OCR typos automatically
5. Strip medicine names from rubric field (only content before colon)
6. Handle multi-line medicine lists and continuation columns

---

## Quick Reference: Path Construction Formula

```
RUBRIC FIELD = [CHAPTER] - [MAJOR_SECTION] - [SUB_SECTION] - [DETAIL]
                  ↓            ↓                   ↓              ↓
Example:        HEAD    -    PAIN        -      sudden    -   talking, while

CHAPTER FIELD = HEAD (only)
```

**Remember:** If you can see it in Kent's printed hierarchy (indentation levels), it must be in the path!

---

## Troubleshooting Common AI Extraction Issues

### Issue 1: Missing Intermediate Sections (e.g., "PAIN" dropped from path)

**Symptom:**
```
❌ HEAD - weather, from changes of
✅ Expected: HEAD - PAIN - weather, from changes of
```

**Root Causes:**
1. **OCR failed to read "PAIN" heading** - If "PAIN" doesn't appear as a clear line in the OCR text, AI cannot infer it
2. **Column continuation confusion** - Right column headers like "swallowing, when:" may confuse hierarchy detection
3. **Indentation lost in OCR** - Without clear indentation, AI cannot determine nesting level
4. **Multi-column layout issues** - Column splitting may separate parent from child rubrics

**Solutions:**
1. **Re-scan at higher DPI** (300+ recommended) to improve OCR accuracy
2. **Crop to single column** before uploading if page has 2-column layout
3. **Manual post-correction** - Edit Excel file to add missing "PAIN -" prefix
4. **Use better source PDF** - Text-based PDFs work better than scanned images

**Quick Fix Script (Python/Excel):**
```python
import pandas as pd

df = pd.read_excel('kent_extracted.xlsx')

# Fix missing PAIN in HEAD chapter modality rubrics
mask = (df['Chapter (English)'] == 'HEAD') & \
       (df['Rubric (English)'].str.contains('weather|cloudy|cold|damp|dry', case=False)) & \
       (~df['Rubric (English)'].str.contains('PAIN', case=False))

df.loc[mask, 'Rubric (English)'] = df.loc[mask, 'Rubric (English)'].apply(
    lambda x: x.replace('HEAD - ', 'HEAD - PAIN - ')
)

df.to_excel('kent_extracted_fixed.xlsx', index=False)
```

### Issue 2: Medicine OCR Errors

**Common patterns:** `Aun-c` → `am-c`, `nux-n` → `nux-v`, `clin` → `chin`

**Solution:** The AI prompt includes medicine spell-correction, but some errors slip through. Review Medicine column for unusual abbreviations and fix manually.

### Issue 3: Continuation Column Misread as New Chapter

**Symptom:**
```
❌ Chapter: SWALLOWING (doesn't exist in Kent)
✅ Should be: HEAD - PAIN - sudden - swallowing, when
```

**Root Cause:** Right column header "swallowing, when:" misinterpreted as chapter heading instead of continuation.

**Solution:** The AI prompt includes context from left column (`lastRubricContext`), but complex pages may still fail. Manual review required.

### Issue 4: Complex Descriptive Rubrics Split into Multiple Rows

**Symptom:**
```
❌ Multiple rows:
HEAD - PAIN - mist
HEAD - PAIN - before  
HEAD - PAIN - eyes

✅ Should be single row:
HEAD - PAIN - mist before eyes | Podo | 2
```

**Solution:** AI treats each word as separate rubric. Manually merge these rows in Excel.

---

## Quality Validation Checklist

After downloading the Excel file, verify:

1. **[ ] Hierarchy Completeness**
   - Sample 10 random rubrics
   - Check that all have full paths (e.g., `HEAD - PAIN - xyz`, not just `HEAD - xyz`)
   - Missing intermediate sections = AI extraction error

2. **[ ] Medicine Abbreviation Quality**
   - Scan for unusual patterns: `Aun-c`, `nux-n`, `clin`, `ziing`
   - Cross-reference with Kent's medicine index
   - Fix typos before clinical use

3. **[ ] Chapter Consistency**
   - Verify chapter names match Kent's 37 standard chapters
   - No phantom chapters (e.g., "SWALLOWING" on page 156-158)

4. **[ ] Grading Accuracy**
   - Grade 3 (bold) medicines should have initial caps: `Bell`, `Nux-v`, `Calc`
   - Grade 1/2 medicines are lowercase: `bell`, `nux-v`, `calc`
   - Verify against original PDF scan

5. **[ ] Completeness**
   - Compare extracted row count to visual rubric count in PDF
   - Target: 96%+ accuracy (4 missing per 100 is acceptable)
   - Major sections missing = re-scan required

---

**Document Version:** 1.0  
**Last Updated:** Based on Page 156-158 validation (96/100 accuracy)  
**Maintained By:** Kent Repertory OCR Team  
**System:** Browser-based OCR Digitizer (Tesseract + Groq/OpenAI AI Structuring)
