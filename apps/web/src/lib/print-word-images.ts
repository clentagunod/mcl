import { boundImage, isPrintImageData, type PrintImage } from './print-studio';

const xmlText = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
const emu = (mm: number) => Math.round(mm * 36000);

/** Word anchors use physical page coordinates, matching the browser canvas. */
export function wordImageAnchors(images: readonly PrintImage[], size: { width: number; height: number }, files: Record<string, Uint8Array>) {
  const relationships: string[] = [];
  const runs = images.map((source, index) => {
    if (!isPrintImageData(source.dataUrl)) throw new Error('An uploaded image is invalid. Remove it and upload it again.');
    const image = boundImage(source, size);
    const id = `rIdStudioImage${index + 1}`;
    const filename = `studio-image-${index + 1}.png`;
    files[`word/media/${filename}`] = Uint8Array.from(atob(image.dataUrl.split(',')[1]), character => character.charCodeAt(0));
    relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`);
    const width = emu(image.width), height = emu(image.height);
    const rotation = Math.round(image.rotation * 60000);
    const run = `<w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251658240 + index}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
      <wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(image.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(image.y)}</wp:posOffset></wp:positionV>
      <wp:extent cx="${width}" cy="${height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${10000 + index}" name="${xmlText(image.name)}"/><wp:cNvGraphicFramePr/>
      <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
      <pic:nvPicPr><pic:cNvPr id="${10000 + index}" name="${xmlText(image.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"><a:alphaModFix amt="${Math.round(image.opacity * 100000)}"/></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
      <pic:spPr><a:xfrm rot="${rotation}"${image.flipX ? ' flipH="1"' : ''}${image.flipY ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
      </pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
    return { image, run };
  });
  return { runs, relationships: relationships.join('') };
}
