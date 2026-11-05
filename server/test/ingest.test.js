import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';
import { detectFormat, extractText } from '../src/services/ingest.js';
import { cleanText, parseCv } from '../src/services/parser.js';

const SAMPLES = new URL('../../sample-cvs/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, SAMPLES));

describe('File ingestion', () => {
  it('detects the real format from the file signature, not the extension', () => {
    assert.equal(detectFormat(read('Karan_Mehta_CV.pdf')), 'pdf');
    assert.equal(detectFormat(read('Sneha_Iyer_CV.docx')), 'docx');
    assert.equal(detectFormat(read('Vikram_Singh_CV.txt')), 'txt');
    assert.equal(detectFormat(Buffer.from([0, 1, 2, 3, 0, 5])), null);
  });

  it('parses a batch of mixed PDF and DOCX files without mixing their contents', async () => {
    const expected = {
      'Karan_Mehta_CV.pdf': 'Karan Mehta',
      'Divya_Rao_CV.pdf': 'Divya Rao',
      'Imran_Qureshi_CV.pdf': 'Imran Qureshi',
      'Sneha_Iyer_CV.docx': 'Sneha Iyer',
      'Rohit_Das_CV.docx': 'Rohit Das',
    };
    for (const [file, name] of Object.entries(expected)) {
      const format = file.endsWith('.pdf') ? 'pdf' : 'docx';
      const parsed = parseCv(cleanText(await extractText(read(file), format)), { fileName: file });
      assert.equal(parsed.name, name, file);
      assert.ok(parsed.experienceYears > 0, `${file} experience`);
      assert.ok(parsed.skills.length >= 3, `${file} skills`);
    }
  });

  it('returns no text for a scanned (image-only) PDF so it can be flagged', async () => {
    const text = await extractText(read('Meera_Pillai_scan.pdf'), 'pdf');
    assert.ok(text.replace(/\s+/g, '').length < 80);
  });

  it('throws for a corrupt PDF', async () => {
    await assert.rejects(() => extractText(read('Suresh_Kumar_corrupt.pdf'), 'pdf'));
  });
});
