import { FRONT_MATTER_POSTFIX, JSON_POSTFIX, YAML_POSTFIX } from './const';
import { JsonDoc, SerializeFormat, SerializeFormatLabel } from './types';
import { toFrontMatterMarkdown, toSortedJSONString, toYAML } from './utils';

export class SerializeFormatJSON implements SerializeFormat {
  format: SerializeFormatLabel = 'json';
  firstExtension = JSON_POSTFIX;
  secondExtension = undefined;

  extension () {
    return JSON_POSTFIX;
  }

  removeExtension (path: string) {
    if (path.endsWith(this.firstExtension))
      return path.replace(new RegExp(this.firstExtension + '$'), '');
    return path;
  }

  hasObjectExtension (path: string) {
    if (path.endsWith(this.firstExtension)) return true;
    return false;
  }

  serialize (doc: JsonDoc) {
    return { extension: JSON_POSTFIX, data: toSortedJSONString(doc) };
  }
}

export class SerializeFormatFrontMatter implements SerializeFormat {
  format: SerializeFormatLabel = 'front-matter';
  firstExtension = FRONT_MATTER_POSTFIX;
  secondExtension = YAML_POSTFIX;

  extension (doc?: JsonDoc) {
    if (doc !== undefined && doc._body === undefined) return YAML_POSTFIX;
    return FRONT_MATTER_POSTFIX;
  }

  removeExtension (path: string) {
    if (path.endsWith(this.firstExtension))
      return path.replace(new RegExp(this.firstExtension + '$'), '');
    if (path.endsWith(this.secondExtension))
      return path.replace(new RegExp(this.secondExtension + '$'), '');
    return path;
  }

  hasObjectExtension (path: string) {
    if (path.endsWith(this.firstExtension) || path.endsWith(this.secondExtension))
      return true;
    return false;
  }

  serialize (doc: JsonDoc) {
    const extension = this.extension(doc);
    return {
      extension,
      data: extension === YAML_POSTFIX ? toYAML(doc) : toFrontMatterMarkdown(doc),
    };
  }
}
