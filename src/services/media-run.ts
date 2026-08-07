import {
  type IImageOptions,
  type IMediaTransformation,
  ImageRun,
  TextRun,
} from 'docx';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageConstant extends ImageDimensions {
  base64: string;
}

export interface Transformation extends Omit<IMediaTransformation, 'height' | 'width'> {
  scale?: number | Partial<ImageDimensions>;
}

export interface IMediaRun extends Omit<IImageOptions, 'data' | 'transformation' | 'type'> {
  data: ImageConstant;
  transformation: Transformation;
}

function getTransformation(
  { width, height }: ImageDimensions,
  { scale = 1, ...rest }: Transformation,
): IMediaTransformation {
  if (typeof scale === 'number') {
    return { ...rest, width: width * scale, height: height * scale };
  }
  if (scale.width) {
    return { ...rest, width: scale.width, height: (scale.width / width) * height };
  }
  if (scale.height) {
    return { ...rest, width: (scale.height / height) * width, height: scale.height };
  }
  return { ...rest, width, height };
}

export async function MediaRun({
  data,
  transformation,
  ...rest
}: IMediaRun): Promise<ImageRun | TextRun> {
  const base64 = data.base64.slice(data.base64.indexOf(',') + 1);
  return new ImageRun({
    ...rest,
    data: Buffer.from(base64, 'base64'),
    type: 'png',
    transformation: getTransformation(data, transformation),
  });
}
