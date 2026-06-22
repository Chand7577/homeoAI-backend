const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

async function extractPages(pdfPath) {
  let dataBuffer = fs.readFileSync(pdfPath);
  let pagesText = [];

  function render_page(pageData) {
    let render_options = {
        normalizeWhitespace: true,
        disableCombineTextItems: false
    };

    return pageData.getTextContent(render_options)
    .then(function(textContent) {
        let lastY, text = '';
        for (let item of textContent.items) {
            if (lastY == item.transform[5] || !lastY){
                text += item.str;
            } else {
                text += '\n' + item.str;
            }    
            lastY = item.transform[5];
        }
        pagesText.push(text);
        return text;
    });
  }

  let options = {
    pagerender: render_page
  };

  await pdf.PDFParse(dataBuffer, options);
  return pagesText;
}

async function run() {
  const filePath = path.join(__dirname, '../uploads/1781927909914-398019508-2015.125811.Pocket-Manual-Of-Homoeopathic-Materia-Medica-Ed8th.pdf');
  console.log("Parsing PDF page by page...");
  try {
    const pages = await extractPages(filePath);
    console.log(`Extracted ${pages.length} pages.`);
    
    // Find headings
    const targetChapters = ["MIND", "HEAD", "EYES", "EARS", "NOSE", "FACE", "MOUTH", "THROAT", "STOMACH", "ABDOMEN", "RECTUM", "URINARY ORGANS", "MALE SEXUAL ORGANS", "FEMALE SEXUAL ORGANS", "RESPIRATORY ORGANS", "CIRCULATORY ORGANS", "BACK", "EXTREMITIES", "SLEEP", "FEVER", "SKIN", "GENERALITIES", "MODALITIES"];
    
    const results = {};
    
    for (let i = 600; i < pages.length; i++) {
       const text = pages[i].toUpperCase();
       for (const ch of targetChapters) {
          if (!results[ch]) {
             // Look for the heading exactly or close to it. In many repertories, chapters are centered or have bold headers.
             if (text.includes(ch)) {
                results[ch] = i + 1; // 1-indexed
             }
          }
       }
    }
    
    console.log("Found chapters:", results);
  } catch (err) {
    console.error(err);
  }
}

run();
