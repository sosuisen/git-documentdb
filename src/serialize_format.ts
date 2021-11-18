import { JsonDoc, SerializeFormat, SerializeFormatLabel } from './types';

export class SerializeFormatJSON implements SerializeFormat {
  format: SerializeFormatLabel = 'json';
  extForObj = '.json';
  match (filePath: string): boolean {
    return true;
  }

  removeExt (filePath: string): string {
    return filePath;
  }

  serialize (doc: JsonDoc): string {
    return '';
  }
}

export class SerializeFormatFrontMatter implements SerializeFormat {
  format: SerializeFormatLabel = 'json';
  extForObj = '.yml';
  extForText = '.md';
  match (filePath: string): boolean {
    return true;
  }

  removeExt (filePath: string): string {
    return filePath;
  }

  serialize (doc: JsonDoc): string {
    return '';
  }
}
