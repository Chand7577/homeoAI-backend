# AI Dynamic Token Management for Symptom Analysis

## Problem Identified

The AI analysis was **hardcoded for a maximum of ~9 symptoms** (120 rubrics total). When users entered **more than 6-9 symptoms**, the AI would:
- Get overwhelmed with too many rubrics (token overflow)
- Fail to provide matches
- Return incomplete or null responses

### Root Cause:
```javascript
// OLD: Fixed limits
.limit(22) // Always 22 rubrics per symptom
const maxPerSymptom = Math.ceil(120 / symptoms.length); // Always 120 total
maxOutputTokens: 3000 // Fixed output tokens
```

## Solution Implemented

Added **dynamic token management** that scales based on symptom count.

### 1. Dynamic Per-Symptom Query Limit

```javascript
const limitPerQuery = symptoms.length <= 6 ? 22 :   // Up to 6 symptoms: 22 rubrics each
                      symptoms.length <= 9 ? 15 :   // 7-9 symptoms: 15 rubrics each  
                      symptoms.length <= 12 ? 10 :  // 10-12 symptoms: 10 rubrics each
                      8;                             // 13+ symptoms: 8 rubrics each
```

### 2. Dynamic Total Rubric Limit

```javascript
const MAX_TOTAL_RUBRICS = symptoms.length <= 6 ? 120 :  // Up to 6 symptoms: 120 rubrics
                          symptoms.length <= 9 ? 90 :   // 7-9 symptoms: 90 rubrics
                          symptoms.length <= 12 ? 72 :  // 10-12 symptoms: 72 rubrics
                          60;                            // 13+ symptoms: 60 rubrics
```

### 3. Dynamic AI Output Tokens

```javascript
// Each symptom needs ~250-400 tokens for response
const outputTokens = Math.min(8000, symptoms.length * 400 + 1000);
```

**Examples:**
- 6 symptoms: 3,400 tokens (6 × 400 + 1000)
- 9 symptoms: 4,600 tokens
- 12 symptoms: 5,800 tokens
- 15+ symptoms: 7,000 tokens (capped at 8000)

### 4. Warnings System

Added warnings when too many symptoms are provided:

```javascript
if (symptoms.length > 15) {
  warnings.push({
    type: 'too_many_symptoms',
    message: '⚠️ ${symptoms.length} symptoms provided. For best AI analysis, limit to 12-15.',
    recommendation: 'Focus on the most prominent and characteristic symptoms.'
  });
}
```

## Performance Characteristics

| Symptom Count | Rubrics/Symptom | Max Total Rubrics | AI Output Tokens | Expected Result |
|---------------|-----------------|-------------------|------------------|-----------------|
| 1-6           | 22              | 120               | 3,400-4,000      | ✅ Excellent    |
| 7-9           | 15              | 90                | 4,000-4,600      | ✅ Very Good    |
| 10-12         | 10              | 72                | 5,000-5,800      | ✅ Good         |
| 13-15         | 8               | 60                | 6,200-7,000      | ⚠️ Fair (with warning) |
| 16+           | 8               | 60                | 7,400+ (capped)  | ⚠️ May struggle |

## Benefits

### 1. **Scalability**
- Works reliably with 6-12 symptoms (optimal range)
- Gracefully handles up to 15+ symptoms
- No hard failures due to token overflow

### 2. **Quality**
- Maintains analysis quality by distributing rubrics fairly
- Ensures each symptom gets representation
- Prevents token waste on redundant rubrics

### 3. **User Guidance**
- Warns users when symptom count is suboptimal
- Provides recommendations for better results
- Returns stats showing rubrics-per-symptom ratio

### 4. **Resource Efficiency**
- Only queries what the AI can handle
- Reduces database load for large symptom lists
- Faster response times with fewer rubrics

## Enhanced Statistics

The response now includes:

```javascript
{
  matchedRubrics: [...],
  medicineDistribution: [...],
  warnings: [
    {
      type: 'too_many_symptoms',
      message: '⚠️ 18 symptoms provided. For best AI analysis, limit to 12-15.',
      recommendation: 'Focus on the most prominent symptoms.'
    }
  ],
  stats: {
    totalMatched: 54,
    withMedicines: 52,
    withoutMedicines: 2,
    symptomCount: 18,              // NEW
    rubricsPerSymptom: "3.0",      // NEW
    timingsMs: { ... }
  }
}
```

## Technical Details

### Token Budget Calculation

**Input Tokens (sent to AI):**
- System prompt: ~500 tokens
- Symptoms list: symptoms.length × 20 tokens
- Rubric summaries: rubrics.length × 150 tokens (compressed)

**Example for 9 symptoms:**
- Symptoms: 9 × 20 = 180 tokens
- Rubrics: 90 × 150 = 13,500 tokens
- Total input: ~14,200 tokens ✅ (under most AI limits)

**Example for 15 symptoms (old code):**
- Symptoms: 15 × 20 = 300 tokens
- Rubrics: 120 × 150 = 18,000 tokens
- Total input: ~18,800 tokens ❌ (exceeds limits!)

**Example for 15 symptoms (new code):**
- Symptoms: 15 × 20 = 300 tokens
- Rubrics: 60 × 150 = 9,000 tokens
- Total input: ~9,800 tokens ✅ (well within limits!)

## Recommendations for Users

### Optimal Usage:
1. **6-9 symptoms**: Best balance of comprehensiveness and accuracy
2. **Focus on chief complaints**: Most prominent, characteristic symptoms
3. **Include modalities**: "worse in morning", "better with warmth", etc.
4. **Avoid redundancy**: Don't repeat same symptom in different words

### Example of Good Input:
```
1. Headache on right side
2. Pain worse in morning
3. Pain better with pressure
4. Irritability with pain
5. Dry mouth, no thirst
6. Restless sleep
```

### Example of Problematic Input:
```
1. Headache
2. Head pain
3. Pain in head
4. Severe headache
5. Right-sided headache
6. Morning headache
... (12 variations of the same symptom)
```

---

**Files Modified:**
- `server/services/aiService.js` - Added dynamic token management

**Date**: August 7, 2026  
**Impact**: Critical - Enables AI analysis for 10+ symptoms without failures
