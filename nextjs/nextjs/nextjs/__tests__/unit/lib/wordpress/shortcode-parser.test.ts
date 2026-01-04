/**
 * Comprehensive TDD Test Suite for WordPress Shortcode Parser
 *
 * This test suite covers WordPress shortcode parsing with:
 * - Shortcode detection and extraction
 * - Attribute parsing
 * - Nested shortcode handling
 * - Error handling for malformed shortcodes
 * - Performance optimization
 *
 * Total: 10+ test cases
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Mock types for shortcode parsing
interface ShortcodeAttributes {
  [key: string]: string | number | boolean;
}

interface ParsedShortcode {
  tag: string;
  attributes: ShortcodeAttributes;
  content?: string;
  position: {
    start: number;
    end: number;
  };
}

interface ParseOptions {
  allowNested?: boolean;
  maxDepth?: number;
  registeredTags?: string[];
}

// Mock shortcode parser class
class WordPressShortcodeParser {
  parse(content: string, options?: ParseOptions): ParsedShortcode[] {
    throw new Error('Not implemented - TDD approach');
  }

  parseAttributes(attrString: string): ShortcodeAttributes {
    throw new Error('Not implemented - TDD approach');
  }

  findShortcodes(content: string, tag: string): ParsedShortcode[] {
    throw new Error('Not implemented - TDD approach');
  }

  replaceShortcodes(
    content: string,
    replacer: (shortcode: ParsedShortcode) => string
  ): string {
    throw new Error('Not implemented - TDD approach');
  }

  validateShortcode(shortcode: string): boolean {
    throw new Error('Not implemented - TDD approach');
  }
}

describe('WordPress Shortcode Parser', () => {
  let parser: WordPressShortcodeParser;

  beforeEach(() => {
    parser = new WordPressShortcodeParser();
  });

  // ============================================================================
  // Basic Shortcode Parsing Tests
  // ============================================================================
  describe('parse', () => {
    describe('Simple Shortcodes', () => {
      it('should parse self-closing shortcode without attributes', () => {
        const content = 'Hello [analytics] World';

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('analytics');
        expect(result[0].attributes).toEqual({});
        expect(result[0].position.start).toBe(6);
        expect(result[0].position.end).toBe(17);
      });

      it('should parse self-closing shortcode with single attribute', () => {
        const content = '[analytics id="123"]';

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('analytics');
        expect(result[0].attributes.id).toBe('123');
      });

      it('should parse shortcode with multiple attributes', () => {
        const content = '[analytics id="123" type="pageview" count=5]';

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('analytics');
        expect(result[0].attributes.id).toBe('123');
        expect(result[0].attributes.type).toBe('pageview');
        expect(result[0].attributes.count).toBe(5);
      });

      it('should parse shortcode with content', () => {
        const content = '[section]This is content[/section]';

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('section');
        expect(result[0].content).toBe('This is content');
      });

      it('should parse multiple shortcodes in content', () => {
        const content = '[analytics id="1"] Some text [analytics id="2"]';

        const result = parser.parse(content);

        expect(result).toHaveLength(2);
        expect(result[0].attributes.id).toBe('1');
        expect(result[1].attributes.id).toBe('2');
      });
    });

    describe('Attribute Parsing', () => {
      it('should parse quoted attributes', () => {
        const content = '[shortcode attr="value with spaces"]';

        const result = parser.parse(content);

        expect(result[0].attributes.attr).toBe('value with spaces');
      });

      it('should parse unquoted attributes', () => {
        const content = '[shortcode attr=value]';

        const result = parser.parse(content);

        expect(result[0].attributes.attr).toBe('value');
      });

      it('should parse numeric attributes', () => {
        const content = '[shortcode count=42 price=19.99]';

        const result = parser.parse(content);

        expect(result[0].attributes.count).toBe(42);
        expect(result[0].attributes.price).toBe(19.99);
      });

      it('should parse boolean attributes', () => {
        const content = '[shortcode enabled=true disabled=false]';

        const result = parser.parse(content);

        expect(result[0].attributes.enabled).toBe(true);
        expect(result[0].attributes.disabled).toBe(false);
      });

      it('should handle attributes with special characters', () => {
        const content = '[shortcode url="https://example.com/path?query=1&other=2"]';

        const result = parser.parse(content);

        expect(result[0].attributes.url).toBe('https://example.com/path?query=1&other=2');
      });

      it('should handle escaped quotes in attributes', () => {
        const content = '[shortcode text="He said \\"Hello\\""]';

        const result = parser.parse(content);

        expect(result[0].attributes.text).toBe('He said "Hello"');
      });
    });

    describe('Nested Shortcodes', () => {
      it('should parse nested shortcodes when enabled', () => {
        const content = '[outer][inner]Content[/inner][/outer]';

        const result = parser.parse(content, { allowNested: true });

        expect(result).toHaveLength(2);
        expect(result[0].tag).toBe('outer');
        expect(result[1].tag).toBe('inner');
      });

      it('should respect max depth limit', () => {
        const content = '[level1][level2][level3]Content[/level3][/level2][/level1]';

        const result = parser.parse(content, { allowNested: true, maxDepth: 2 });

        expect(result).toHaveLength(2);
        expect(result[0].tag).toBe('level1');
        expect(result[1].tag).toBe('level2');
      });

      it('should not parse nested shortcodes when disabled', () => {
        const content = '[outer][inner]Content[/inner][/outer]';

        const result = parser.parse(content, { allowNested: false });

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('outer');
        expect(result[0].content).toBe('[inner]Content[/inner]');
      });
    });

    describe('Whitelist Filtering', () => {
      it('should only parse registered shortcode tags', () => {
        const content = '[allowed]Content[/allowed] [notallowed]Content[/notallowed]';

        const result = parser.parse(content, {
          registeredTags: ['allowed'],
        });

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('allowed');
      });

      it('should parse all shortcodes when no whitelist provided', () => {
        const content = '[tag1]Content[/tag1] [tag2]Content[/tag2]';

        const result = parser.parse(content);

        expect(result).toHaveLength(2);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty content', () => {
        const content = '';

        const result = parser.parse(content);

        expect(result).toHaveLength(0);
      });

      it('should handle content without shortcodes', () => {
        const content = 'This is plain text without any shortcodes.';

        const result = parser.parse(content);

        expect(result).toHaveLength(0);
      });

      it('should handle malformed shortcodes', () => {
        const content = '[unclosed [properly]Closed[/properly]';

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].tag).toBe('properly');
      });

      it('should handle shortcodes with line breaks', () => {
        const content = `[shortcode
          attr1="value1"
          attr2="value2"
        ]Content[/shortcode]`;

        const result = parser.parse(content);

        expect(result).toHaveLength(1);
        expect(result[0].attributes.attr1).toBe('value1');
        expect(result[0].attributes.attr2).toBe('value2');
      });
    });
  });

  // ============================================================================
  // Attribute Parsing Tests
  // ============================================================================
  describe('parseAttributes', () => {
    it('should parse simple key-value pairs', () => {
      const attrString = 'key1="value1" key2="value2"';

      const result = parser.parseAttributes(attrString);

      expect(result.key1).toBe('value1');
      expect(result.key2).toBe('value2');
    });

    it('should handle empty attribute string', () => {
      const attrString = '';

      const result = parser.parseAttributes(attrString);

      expect(result).toEqual({});
    });

    it('should handle attributes without values', () => {
      const attrString = 'standalone key="value"';

      const result = parser.parseAttributes(attrString);

      expect(result.standalone).toBe(true);
      expect(result.key).toBe('value');
    });

    it('should handle mixed quote styles', () => {
      const attrString = `key1="double" key2='single' key3=unquoted`;

      const result = parser.parseAttributes(attrString);

      expect(result.key1).toBe('double');
      expect(result.key2).toBe('single');
      expect(result.key3).toBe('unquoted');
    });

    it('should trim whitespace from values', () => {
      const attrString = 'key="  value with spaces  "';

      const result = parser.parseAttributes(attrString);

      expect(result.key).toBe('value with spaces');
    });
  });

  // ============================================================================
  // Find Shortcodes Tests
  // ============================================================================
  describe('findShortcodes', () => {
    it('should find all instances of specific shortcode tag', () => {
      const content = '[analytics id="1"] Text [analytics id="2"] More [other]';

      const result = parser.findShortcodes(content, 'analytics');

      expect(result).toHaveLength(2);
      expect(result[0].attributes.id).toBe('1');
      expect(result[1].attributes.id).toBe('2');
    });

    it('should return empty array when tag not found', () => {
      const content = '[other]Content[/other]';

      const result = parser.findShortcodes(content, 'analytics');

      expect(result).toHaveLength(0);
    });

    it('should be case-sensitive by default', () => {
      const content = '[Analytics] [analytics]';

      const result = parser.findShortcodes(content, 'analytics');

      expect(result).toHaveLength(1);
    });
  });

  // ============================================================================
  // Replace Shortcodes Tests
  // ============================================================================
  describe('replaceShortcodes', () => {
    it('should replace shortcodes with custom content', () => {
      const content = 'Before [analytics] After';

      const result = parser.replaceShortcodes(content, (shortcode) => {
        return '<div class="analytics"></div>';
      });

      expect(result).toBe('Before <div class="analytics"></div> After');
    });

    it('should replace multiple shortcodes', () => {
      const content = '[analytics id="1"] [analytics id="2"]';

      const result = parser.replaceShortcodes(content, (shortcode) => {
        return `<div id="${shortcode.attributes.id}"></div>`;
      });

      expect(result).toBe('<div id="1"></div> <div id="2"></div>');
    });

    it('should preserve content when no shortcodes found', () => {
      const content = 'Plain text without shortcodes';

      const result = parser.replaceShortcodes(content, () => 'replaced');

      expect(result).toBe(content);
    });

    it('should handle replacer returning empty string', () => {
      const content = 'Before [analytics] After';

      const result = parser.replaceShortcodes(content, () => '');

      expect(result).toBe('Before  After');
    });
  });

  // ============================================================================
  // Validation Tests
  // ============================================================================
  describe('validateShortcode', () => {
    it('should validate well-formed shortcode', () => {
      const shortcode = '[analytics id="123"]';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(true);
    });

    it('should reject shortcode without opening bracket', () => {
      const shortcode = 'analytics]';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(false);
    });

    it('should reject shortcode without closing bracket', () => {
      const shortcode = '[analytics';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(false);
    });

    it('should reject shortcode with invalid tag name', () => {
      const shortcode = '[123invalid]';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(false);
    });

    it('should validate shortcode with closing tag', () => {
      const shortcode = '[section]Content[/section]';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(true);
    });

    it('should reject mismatched closing tags', () => {
      const shortcode = '[section]Content[/different]';

      const result = parser.validateShortcode(shortcode);

      expect(result).toBe(false);
    });
  });
});
