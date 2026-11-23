/**
 * @file xml_entity_guard.ts
 * Defensive XML external entity (XXE) and SSRF injection mitigation for SVG and DrawIO XML pipelines.
 */

export class XmlSecurityError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'XmlSecurityError';
    this.code = code;
  }
}

export interface XmlGuardOptions {
  allowDataUris?: boolean;
  maxDataUriBytes?: number;
  allowExternalHttp?: boolean;
  strictRejection?: boolean; // if true, throws on DOCTYPE/ENTITY; if false, strips them
}

export interface XmlSanitizationResult {
  cleanXml: string;
  isSanitized: boolean;
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<XmlGuardOptions> = {
  allowDataUris: true,
  maxDataUriBytes: 256 * 1024, // 256 KB max data URI payload
  allowExternalHttp: false,
  strictRejection: true,
};

// Dangerous processing instructions and directives
const DISALLOWED_PI_REGEX = /<\?(?:xml-stylesheet|php|exec|eval)[\s\S]*?\?>/gi;
const DTD_DOCTYPE_REGEX = /<!DOCTYPE[\s\S]*?(?:\[[\s\S]*?\]\s*)?>/gi;
const DTD_ENTITY_REGEX = /<!ENTITY\s+[\s\S]*?>/gi;
const SYSTEM_PUBLIC_REGEX = /\b(?:SYSTEM|PUBLIC)\s+["'][^"']*["']/gi;
const RECURSIVE_ENTITY_REF_REGEX = /(?:&[a-zA-Z0-9_\-\.]+;\s*){4,}/;

// URL and attribute patterns
const HREF_ATTR_REGEX = /\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi;
const DATA_URI_IMAGE_REGEX = /^data:image\/(?:png|jpeg|jpg|svg\+xml|webp);base64,([A-Za-z0-9+/=]+)$/i;

/**
 * Sanitizes XML / SVG content against XXE, entity bombs, dangerous PIs, and SSRF hrefs.
 */
export function sanitizeXmlContent(
  rawXml: string,
  options: XmlGuardOptions = {}
): XmlSanitizationResult {
  if (typeof rawXml !== 'string') {
    throw new XmlSecurityError('ERR_INVALID_PAYLOAD', 'XML content must be a string');
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  let isSanitized = false;
  let content = rawXml;

  // 1. Recursive Entity Expansion / Billion Laughs Detection
  if (RECURSIVE_ENTITY_REF_REGEX.test(content)) {
    throw new XmlSecurityError(
      'ERR_ENTITY_BOMB',
      'Detected recursive or nested entity reference expansion pattern (Billion Laughs signature)'
    );
  }

  // 2. XXE & DTD Gating
  if (DTD_DOCTYPE_REGEX.test(content) || DTD_ENTITY_REGEX.test(content) || SYSTEM_PUBLIC_REGEX.test(content)) {
    if (opts.strictRejection) {
      throw new XmlSecurityError(
        'ERR_XXE_DETECTED',
        'Inbound XML contains prohibited DOCTYPE, ENTITY, or SYSTEM/PUBLIC external resource references'
      );
    } else {
      content = content.replace(DTD_DOCTYPE_REGEX, '');
      content = content.replace(DTD_ENTITY_REGEX, '');
      warnings.push('Stripped DOCTYPE / ENTITY DTD declarations');
      isSanitized = true;
    }
  }

  // 3. Dangerous Processing Instructions
  if (DISALLOWED_PI_REGEX.test(content)) {
    content = content.replace(DISALLOWED_PI_REGEX, '');
    warnings.push('Stripped dangerous XML processing instructions (xml-stylesheet/php/exec)');
    isSanitized = true;
  }

  // 4. HREF Attribute Sanitization (SSRF, JavaScript, Data URI bounds)
  content = content.replace(HREF_ATTR_REGEX, (match, quote, hrefVal) => {
    const rawHref = hrefVal.trim();
    const lowerHref = rawHref.toLowerCase();

    // Block scripting schemes
    if (lowerHref.startsWith('javascript:') || lowerHref.startsWith('vbscript:')) {
      isSanitized = true;
      warnings.push(`Blocked malicious script URI in href: ${rawHref}`);
      return `href=${quote}#${quote}`;
    }

    // Validate Data URIs
    if (lowerHref.startsWith('data:')) {
      if (!opts.allowDataUris) {
        isSanitized = true;
        warnings.push(`Data URIs are disabled; blocked: ${rawHref.slice(0, 32)}...`);
        return `href=${quote}#${quote}`;
      }

      if (!DATA_URI_IMAGE_REGEX.test(rawHref)) {
        isSanitized = true;
        warnings.push(`Blocked invalid or non-image data URI format in href`);
        return `href=${quote}#${quote}`;
      }

      const byteSize = Math.floor((rawHref.length * 3) / 4);
      if (byteSize > opts.maxDataUriBytes) {
        throw new XmlSecurityError(
          'ERR_DATA_URI_TOO_LARGE',
          `Embedded data URI (${byteSize} bytes) exceeds maximum ceiling of ${opts.maxDataUriBytes} bytes`
        );
      }

      return match;
    }

    // Validate Remote HTTP / HTTPS URLs (SSRF mitigation)
    if (lowerHref.startsWith('http://') || lowerHref.startsWith('https://')) {
      if (!opts.allowExternalHttp) {
        isSanitized = true;
        warnings.push(`External HTTP(S) hrefs prohibited to prevent SSRF: ${rawHref}`);
        return `href=${quote}#${quote}`;
      }

      try {
        const parsed = new URL(rawHref);
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '::1' ||
          host === '169.254.169.254' ||
          host.endsWith('.internal')
        ) {
          throw new XmlSecurityError(
            'ERR_SSRF_HREF',
            `Target host '${host}' is prohibited (loopback / cloud metadata SSRF defense)`
          );
        }
      } catch (err: any) {
        if (err instanceof XmlSecurityError) throw err;
        throw new XmlSecurityError('ERR_SSRF_HREF', `Malformed URL in href: ${rawHref}`);
      }
    }

    return match;
  });

  return {
    cleanXml: content,
    isSanitized,
    warnings,
  };
}
