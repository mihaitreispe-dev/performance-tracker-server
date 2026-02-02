export const dispositionToFilename = (disposition: string): string | undefined => {
  const utf8FilenameRegex = /filename\*=UTF-8''([\w%\-.]+)(?:; ?|$)/i;
  const asciiFilenameRegex = /^filename=(["']?)(.*?[^\\])\1(?:; ?|$)/i;

  let fileName: string | undefined;
  if (utf8FilenameRegex.test(disposition)) {
    const utf8FilenameRegexMatch = utf8FilenameRegex.exec(disposition);
    if (utf8FilenameRegexMatch) {
      fileName = decodeURIComponent(utf8FilenameRegexMatch[1]);
    }
  } else {
    // prevent ReDos attacks by anchoring the ascii regex to string start and
    //  slicing off everything before 'filename='
    const filenameStart = disposition.toLowerCase().indexOf('filename=');
    if (filenameStart >= 0) {
      const partialDisposition = disposition.slice(filenameStart);
      const matches = asciiFilenameRegex.exec(partialDisposition);
      if (matches != null && matches[2]) {
        fileName = matches[2];
      }
    }
  }
  return fileName;
};
