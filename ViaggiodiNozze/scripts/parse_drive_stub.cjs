function parseGoogleDriveUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { isValid: false, isFolder: false, cleanUrl: '', error: 'Inserisci un indirizzo Google Drive valido.' };
  }
  if (!/^https:\/\//i.test(trimmed)) {
    return { isValid: false, isFolder: false, cleanUrl: '', error: 'Il link deve iniziare con https://' };
  }
  const isGoogleDomain = /^https:\/\/(?:drive|docs|sites)\.google\.com\//i.test(trimmed);
  if (!isGoogleDomain) {
    return {
      isValid: false,
      isFolder: false,
      cleanUrl: trimmed,
      error: 'Il link inserito non appartiene a Google Drive (drive.google.com o docs.google.com).'
    };
  }

  let fileId;
  let isFolder = false;

  const folderMatch = /\/folders\/([a-zA-Z0-9_-]+)/.exec(trimmed);
  if (folderMatch) {
    fileId = folderMatch[1];
    isFolder = true;
  } else {
    const fileMatch = /\/(?:file|document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
    if (fileMatch) {
      fileId = fileMatch[1];
    } else {
      const idParamMatch = /[?&]id=([a-zA-Z0-9_-]+)/.exec(trimmed);
      if (idParamMatch) {
        fileId = idParamMatch[1];
      }
    }
  }

  return { isValid: true, fileId, isFolder, cleanUrl: trimmed };
}

module.exports = { parseGoogleDriveUrl };

