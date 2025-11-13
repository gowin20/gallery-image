import fetch from "node-fetch";
import { parse, isAbsolute, dirname, resolve } from "path";
import { createWriteStream, readFileSync } from "fs";
import { Console } from "console";
import { fileURLToPath } from "url";

const urlRegex = /^(http|https):\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(:\d+)?(\/\S*)?$/;
const httpRegex = /^(http|https):\/\/*/;

export const minimumTileSize = (widthOrHeight:number): number => {
    let minimumTileSize = widthOrHeight - (widthOrHeight % 16);
    while (minimumTileSize % 16 == 0 && minimumTileSize > 256) minimumTileSize /= 2;
    return minimumTileSize;
}

export const validatePath = (filePathOrUrl: string | URL): string => {

    if (filePathOrUrl instanceof URL) return filePathOrUrl.href;
    else if (urlRegex.test(filePathOrUrl) || httpRegex.test(filePathOrUrl)) return filePathOrUrl;
    else {
        // path points to a local file or directory
        if (isAbsolute(filePathOrUrl)) return filePathOrUrl;
        else {

            return resolve(filePathOrUrl);
            //return absolutePath.href;
        }
    }
}

export const getResourceBuffer = async (filePathOrUrl: string | URL): Promise<Buffer> => {

    let imageBuffer: Buffer;
    // If URL
    if (filePathOrUrl instanceof URL || urlRegex.test(filePathOrUrl) || httpRegex.test(filePathOrUrl) ) {

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


let logLevel: string;
export const setupLogging = (level: string, jobName: string) => {
    logLevel = level;
    if (logLevel === 'verbose') {
        const logOutput = createWriteStream(`${jobName}-${Date.now()}.log`, {flags: 'a'});
        const logger = new Console(logOutput, logOutput);
        console.log = logger.log;
        console.error = logger.error;
    }
}

export const log = (message:string) => {
    if (logLevel !== 'none') console.log(message);
}
export const error = (error:Error) => {
    if (logLevel !== 'none') console.error(error);
}