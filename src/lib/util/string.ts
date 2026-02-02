export function wrapText(text: string, maxLineLength: number, maxLines: number = 0) {
  const inputLines = text.split('\n');
  let outputLines: string[] = [];

  for (let lineIndex = 0; lineIndex < inputLines.length; lineIndex++) {
    let line = '';
    const words = inputLines[lineIndex].split(' ');
    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      const testLine = wordIndex === 0 ? word : `${line} ${word}`;
      const testWidth = testLine.length;
      if (testWidth > maxLineLength && line.length > 0) {
        outputLines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    outputLines.push(line);
  }

  if (maxLines && outputLines.length > maxLines) {
    outputLines = outputLines.slice(0, maxLines);
    let lastLine = outputLines[outputLines.length - 1];
    lastLine = lastLine.substring(0, maxLineLength - 3);
    lastLine += '...';
    outputLines[outputLines.length - 1] = lastLine;
  }
  return outputLines;
}

export const millisecondsToMMSS = (millis: number) => {
  const minutes = Math.floor(millis / 60000);
  const seconds = Math.floor((millis % 60000) / 1000);

  let minutesStr = minutes.toString();
  if (minutes < 10) {
    minutesStr = '0' + minutes;
  }
  let secondsStr = seconds.toString();
  if (seconds < 10) {
    secondsStr = '0' + seconds;
  }
  return minutesStr + ':' + secondsStr;
};

export const removeExtension = (text: string) => {
  const components = text.split('.');
  if (components.length > 1) {
    components.pop();
  }
  return components.join('.');
};
