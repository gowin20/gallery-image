import fetch from "node-fetch";
import { parse } from "path";
import { writeFileSync, readFileSync } from "fs";

const urlRegex = /^(http|https):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(:\d+)?(\/\S*)?$/;
const httpRegex = /^(http|https):\/\/*/;

export const minimumTileSize = (widthOrHeight:number): number => {
    let minimumTileSize = widthOrHeight - (widthOrHeight % 16);
    while (minimumTileSize % 16 == 0 && minimumTileSize > 256) minimumTileSize /= 2;
    return minimumTileSize;
}

export const getResourceBuffer = async (filePathOrUrl: string | URL): Promise<Buffer> => {

    let imageBuffer: Buffer;
    // If URL
    if (filePathOrUrl instanceof URL || urlRegex.test(filePathOrUrl) || httpRegex.test(filePathOrUrl) ) {
        console.log('Input is URL 4',filePathOrUrl);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const origImage = await fetch(filePathOrUrl, { signal: controller.signal });

        clearTimeout(timeout);

        const imageBody = await origImage.arrayBuffer();

        imageBuffer = Buffer.from(imageBody);
    }
    // If local path
    else {
        const origImage = await readFileSync(filePathOrUrl);
        imageBuffer = origImage;
    }
    // Otherwise, local file

    return imageBuffer;
}

/**
 * Gets the file name without extension.
 * @param filePathOrUrl file path, URL string, or URL object
 * @returns 
 */
export const getFileName = (filePathOrUrl: string | URL): string => {
    let path: string;
    if (filePathOrUrl instanceof URL) {
        path = filePathOrUrl.pathname;
    }
    else {
        path = filePathOrUrl;
    }

    const fileName = parse(path).name;

    return fileName;
}

export const cleanTrailingSlash = (path) => {
    return path.replace(/([^/])\/+$/, '$1');
}