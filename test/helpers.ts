import JSZip from 'jszip';

export async function makeDocx(textXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${textXml}<w:sectPr/></w:body></w:document>`);
  zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph"/></w:styles>');
  return zip.generateAsync({ type: 'uint8array' });
}

export async function documentXml(document: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(document);
  return zip.file('word/document.xml')!.async('string');
}

export async function stylesXml(document: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(document);
  return zip.file('word/styles.xml')!.async('string');
}
