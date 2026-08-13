const fs = require('fs');

function getMp4Duration(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  
  while (offset < buffer.length - 8) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    
    if (size === 0) break;
    
    if (type === 'moov') {
      let moovOffset = offset + 8;
      const moovEnd = offset + size;
      
      while (moovOffset < moovEnd - 8) {
        const subSize = buffer.readUInt32BE(moovOffset);
        const subType = buffer.toString('ascii', moovOffset + 4, moovOffset + 8);
        
        if (subSize === 0) break;
        
        if (subType === 'mvhd') {
          const version = buffer.readUInt8(moovOffset + 8);
          let timescale, duration;
          
          if (version === 1) {
            timescale = buffer.readUInt32BE(moovOffset + 28);
            duration = Number(buffer.readBigUInt64BE(moovOffset + 32));
          } else {
            timescale = buffer.readUInt32BE(moovOffset + 20);
            duration = buffer.readUInt32BE(moovOffset + 24);
          }
          
          return {
            durationSeconds: duration / timescale,
            timescale,
            durationRaw: duration,
          };
        }
        
        moovOffset += subSize;
      }
    }
    
    offset += size;
  }
  return null;
}

try {
  const info = getMp4Duration('public/bg.mp4');
  console.log('MP4 INFO:', JSON.stringify(info, null, 2));
} catch (e) {
  console.error('Error:', e);
}
