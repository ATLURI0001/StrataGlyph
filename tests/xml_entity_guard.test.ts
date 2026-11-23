import { describe, it, expect } from 'vitest';
import {
  sanitizeXmlContent,
  XmlSecurityError,
} from '../src/xml_entity_guard.ts';

describe('XmlEntityGuard Defensive Suite', () => {
  it('allows nominal clean SVG without modifications', () => {
    const cleanSvg = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="blue"/></svg>';
    const result = sanitizeXmlContent(cleanSvg);
    expect(result.cleanXml).toBe(cleanSvg);
    expect(result.isSanitized).toBe(false);
    expect(result.warnings.length).toBe(0);
  });

  it('rejects XXE DOCTYPE and SYSTEM entities in strict mode', () => {
    const xxePayload = `<?xml version="1.0"?>
<!DOCTYPE svg [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<svg>&xxe;</svg>`;

    expect(() => sanitizeXmlContent(xxePayload, { strictRejection: true })).toThrowError(
      expect.objectContaining({ code: 'ERR_XXE_DETECTED' })
    );
  });

  it('strips DOCTYPE and ENTITY cleanly in non-strict mode', () => {
    const xxePayload = `<!DOCTYPE svg [ <!ENTITY xxe "hello"> ]><svg><text>hello</text></svg>`;
    const result = sanitizeXmlContent(xxePayload, { strictRejection: false });
    expect(result.cleanXml).not.toContain('<!DOCTYPE');
    expect(result.cleanXml).not.toContain('<!ENTITY');
    expect(result.isSanitized).toBe(true);
    expect(result.warnings).toContain('Stripped DOCTYPE / ENTITY DTD declarations');
  });

  it('detects and rejects recursive entity expansion bombs (Billion Laughs)', () => {
    const bombPayload = '<svg><text>&lol1;&lol2;&lol3;&lol4;&lol5;</text></svg>';
    expect(() => sanitizeXmlContent(bombPayload)).toThrowError(
      expect.objectContaining({ code: 'ERR_ENTITY_BOMB' })
    );
  });

  it('strips dangerous XML processing instructions', () => {
    const piPayload = '<?xml-stylesheet href="attack.xsl"?><svg><?php echo "malicious"; ?><circle r="10"/></svg>';
    const result = sanitizeXmlContent(piPayload);
    expect(result.cleanXml).not.toContain('xml-stylesheet');
    expect(result.cleanXml).not.toContain('php');
    expect(result.isSanitized).toBe(true);
  });

  it('neutralizes javascript: script href injection in image and use elements', () => {
    const xssPayload = '<svg><image href="javascript:alert(document.domain)"/><use xlink:href="vbscript:msgbox()"/></svg>';
    const result = sanitizeXmlContent(xssPayload);
    expect(result.cleanXml).not.toContain('javascript:');
    expect(result.cleanXml).not.toContain('vbscript:');
    expect(result.cleanXml).toContain('href="#"');
    expect(result.isSanitized).toBe(true);
  });

  it('mitigates SSRF against cloud metadata and loopback hosts', () => {
    const metadataPayload = '<svg><image href="http://169.254.169.254/latest/meta-data"/></svg>';
    // By default, external HTTP is blocked to prevent SSRF
    const defaultResult = sanitizeXmlContent(metadataPayload, { allowExternalHttp: false });
    expect(defaultResult.cleanXml).toContain('href="#"');

    // When external HTTP is explicitly enabled, metadata and loopback are strictly blocked
    expect(() => sanitizeXmlContent(metadataPayload, { allowExternalHttp: true })).toThrowError(
      expect.objectContaining({ code: 'ERR_SSRF_HREF' })
    );

    const loopbackPayload = '<svg><image href="http://localhost:8080/internal-secrets"/></svg>';
    expect(() => sanitizeXmlContent(loopbackPayload, { allowExternalHttp: true })).toThrowError(
      expect.objectContaining({ code: 'ERR_SSRF_HREF' })
    );
  });

  it('allows valid embedded base64 image data URIs', () => {
    const validDataUri = '<svg><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="/></svg>';
    const result = sanitizeXmlContent(validDataUri);
    expect(result.cleanXml).toContain('data:image/png;base64,');
  });

  it('rejects oversized data URIs exceeding budget', () => {
    const oversizedPayload = `<svg><image href="data:image/png;base64,${'A'.repeat(500)}"/></svg>`;
    expect(() => sanitizeXmlContent(oversizedPayload, { maxDataUriBytes: 100 })).toThrowError(
      expect.objectContaining({ code: 'ERR_DATA_URI_TOO_LARGE' })
    );
  });

  it('neutralizes non-image data URIs like data:text/html', () => {
    const textHtmlPayload = '<svg><image href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="/></svg>';
    const result = sanitizeXmlContent(textHtmlPayload);
    expect(result.cleanXml).not.toContain('data:text/html');
    expect(result.cleanXml).toContain('href="#"');
  });
});
