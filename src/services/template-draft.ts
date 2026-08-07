import {
  HorizontalPositionAlign,
  Paragraph,
  patchDocument,
  PatchType,
  TextRun,
  VerticalPositionAlign,
} from 'docx';

import { draftImage } from './draft-image';
import { type IMediaRun, MediaRun } from './media-run';

export async function parseTemplateDraft(file: Buffer, data: unknown): Promise<Buffer> {
  const source = data && typeof data === 'object' ? data as { formExtraInfo?: { endOfFlow?: unknown } } : {};
  const endOfFlow = source.formExtraInfo?.endOfFlow ?? false;
  const child = endOfFlow
    ? new TextRun({ text: '' })
    : await MediaRun({
      data: {
        base64: draftImage,
        width: 596,
        height: 242,
      },
      transformation: {
        scale: { width: 300 },
      },
      floating: {
        verticalPosition: { align: VerticalPositionAlign.TOP },
        horizontalPosition: { align: HorizontalPositionAlign.RIGHT },
      },
    } satisfies IMediaRun);

  const template = await patchDocument({
    outputType: 'nodebuffer',
    data: file,
    patches: {
      draft: {
        type: PatchType.DOCUMENT,
        children: [new Paragraph({ children: [child] })],
      },
    },
  });

  return Buffer.from(template);
}
