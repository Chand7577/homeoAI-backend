# Kent Extraction - Missing Rubrics Issue

## Problem Statement

The Kent OCR extraction is **missing many rubrics** from the RECTUM - CONSTIPATION page. Out of approximately 30+ sub-rubrics visible in the original page, only 8 were extracted.

## Example: RECTUM - CONSTIPATION Page

### ✅ Rubrics Successfully Extracted (8):
1. difficult stool
2. natural stool
3. soft stool
4. standing, can pass stool only while
5. stool slips back
6. urinating, can pass stool only when
7. drugs, after abuse of
8. (empty entry with no medicine)

### ❌ Rubrics MISSING from Extraction (20+):
1. **difficult stool (see "Inactivity")** - Cross-reference
2. **insufficient, incomplete, unsatisfactory stools**
3. **menses, before**
4. **menses, during**
5. **menses, after** 
6. **suppressed, during**
7. **old people**
8. **painful**
9. **portal stasis, from**
10. **pregnancy, during**
11. **sedentary habits, from**
12. **dryness of rectum, from**
13. **fruitless urging, with**
14. **hard stool, from**
15. **CONSTIPATION, contraction, closure** (separate main rubric on right column)
16. And more on the right column...

## Root Causes

### 1. Multi-line Rubric Format Not Handled

Kent's Repertory often has rubrics that span multiple lines:

```
menses, before: Ant-c., bry., graph., Kali-c.,
  lach., mag-c., nat-s., nux-v., Sil., sulph.,
  vesp.
```

The parser sees this as:
- Line 1: "menses, before: Ant-c., bry., graph., Kali-c.,"
- Line 2: "lach., mag-c., nat-s., nux-v., Sil., sulph.,"

If the continuation line doesn't have a colon, it might be treated as a continuation of the previous rubric instead of being collected.

### 2. Cross-References Skipped

Lines like:
```
difficult stool (see "Inactivity"): ...
```

The parser might skip these thinking they're not actual rubric entries, when in fact they ARE valid rubrics with cross-references.

### 3. Rubrics Without Immediate Medicines

Some rubrics appear without medicines immediately following:

```
CONSTIPATION, contraction, closure, etc:
  Acon., aesc., aetlh., agar., am-c., ant-c., bell.,
  ...
```

If "CONSTIPATION, contraction, closure, etc:" is on its own line, the parser might not recognize it as a rubric because there's no colon+medicine pattern on the same line.

### 4. Special Formatting Patterns

The original Kent page has entries like:
```
fruitless urging, with. (See "Urging, inef-
fectual.")
```

These are being completely skipped.

## Current Parser Limitations

### kentTextParser.js (Basic Parser)
- Only detects rubrics with format: `rubric_text: medicines`
- Requires colon on the same line as medicines
- Doesn't handle cross-references like "(See 'Inactivity')"
- Doesn't properly collect multi-line medicine lists

### Groq AI Parser (kentTesseractParser.js)
- Better at handling complex formats
- But still misses some rubrics
- May not be parsing all text from the PDF properly

## Recommended Solutions

### Option 1: Improve Multi-line Collection (Basic Parser)

Enhance the medicine buffer collection logic to:
1. Detect rubrics even without medicines on same line
2. Collect ALL indented lines following a rubric as medicines
3. Handle cross-references like "(See 'xyz')" as valid rubric entries

```javascript
// Current logic (WRONG):
if (trimmed.includes(':')) {
  // Only processes lines with colon
}

// Improved logic (BETTER):
if (trimmed.includes(':') || isIndentedMedicineLine) {
  // Process both rubric lines AND continuation lines
}
```

### Option 2: Enhance Groq AI Instructions (AI Parser)

Update the Groq prompt to explicitly handle:
- Cross-references: "(See 'Inactivity')" should be recognized
- Multi-line formats: Continue collecting until next rubric starts
- Standalone rubric lines: "painful:" with medicines on next line

```javascript
const prompt = `...
SPECIAL CASES:
1. Cross-references: "difficult stool (see 'Inactivity')" is a VALID rubric
2. Multi-line medicines: Collect ALL medicines until next rubric appears
3. Standalone rubrics: "painful:" followed by indented medicines on next line
...`;
```

### Option 3: Two-Pass Parsing

1. **Pass 1**: Extract ALL potential rubric lines (any line ending with colon or containing keywords)
2. **Pass 2**: Collect medicines for each rubric by looking at indented lines below it

## Testing Strategy

Use the RECTUM - CONSTIPATION page as the test case:
- Expected: 30+ rubrics extracted
- Currently: 8 rubrics extracted
- Target: Extract ALL rubrics including cross-references and multi-line entries

## Priority

**HIGH** - This affects the completeness of Kent Repertory extraction. Missing rubrics means:
- Doctors cannot find important modalities and conditions
- Analysis system has incomplete data
- Manual correction would be extremely time-consuming for 1000+ pages

## Next Steps

1. ✅ Document the issue (this file)
2. Choose solution approach (Option 2 - Groq AI enhancement recommended)
3. Update Groq AI prompt to handle special cases
4. Test with RECTUM page
5. Verify all 30+ rubrics are extracted
6. Deploy and re-extract Kent Repertory

---

**Created**: 2025-01-28
**Status**: Open - Needs implementation
**Impact**: Critical - Affects completeness of Kent extraction
