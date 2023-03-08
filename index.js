const fs = require('fs');
const zlib = require('zlib');
const stdin = process.openStdin();
let convertIndexedToRGBA = (buffer,previous)=>{
    let {width,height} = previous.chunks.find(e=>e.type=='IHDR').data
    let palette=[0,0,0,255,255,255]  // normally I would use Array.from(previous.chunks.find(e=>e.type=='PLTE').data) but i will convert them to black and white anyways
    let divWidth = width/8
    let ceiledWidth = Math.ceil(width/8)
    let freq = ceiledWidth+1
    let minus = (freq-1-divWidth)*8
    let result = []
    let pMemo = {}
    let p = (x)=>{
        if(pMemo[x])return pMemo[x]
        return pMemo[x]=2**(7-x)
    }
    for(let i = 0;i<buffer.length;i++){
        let modFreq = i%freq
        if(modFreq==0)continue
        let limit = modFreq==ceiledWidth?8-minus:8
        for(let j = 0;j<limit;j++){
            let current = buffer[i]&p(j)
            for(let k = 0;k<3;k++){
                result.push(palette[current*3+k])
            }
            result.push(255)
        }
    }
    return result
 /* This was the original approach, but it was too slow
 return Array.from(buffer).map((e,i)=>{
    let modFreq = i%freq
    if(modFreq==0)return []
    return e.toString(2).padStart(8,'0').slice(0,8-minus*(modFreq==ceiledWidth)).split('').map(e=>palette.slice(e*3,e*3+3).concat(255)).flat()
  }).flat() */
}
let parseChunk = (chunk,previous) => {
    switch (chunk.type) {
        case 'IHDR':
            chunk.data = parseIHDR(chunk.data);
            break;
        case 'IDAT':
            chunk.data = convertIndexedToRGBA(zlib.inflateSync(chunk.data),previous);
            break;
        case 'IEND':
            break;
        default:
            break;
    }
    return chunk;
}
let parseIHDR = (data) => {
    let ihdr = {};
    ihdr.width = data.readUInt32BE(0);
    ihdr.height = data.readUInt32BE(4);
    ihdr.bitDepth = data.readUInt8(8);
    ihdr.colorType = data.readUInt8(9);
    ihdr.compressionMethod = data.readUInt8(10);
    ihdr.filterMethod = data.readUInt8(11);
    ihdr.interlaceMethod = data.readUInt8(12);
    return ihdr;
}
let parsePNG = (buffer) => {
    let png = {};
    let i = 0;
    png.header = buffer.toString('ascii', i, i += 8);
    png.chunks = [];
    while (i < buffer.length-3) {
        let chunk = {};
        chunk.length = buffer.readUInt32BE(i);
        i += 4;
        chunk.type = buffer.toString('ascii', i, i += 4);
        chunk.data = buffer.slice(i, i += chunk.length);
        chunk.crc = buffer.readUInt32BE(i);
        i += 4;
        png.chunks.push(parseChunk(chunk,png));
    }   
    return png;
}
let getPixelData = buffer=>{
    let png = Buffer.isBuffer(buffer)?parsePNG(buffer):buffer;
    let pixelData = png.chunks.find(chunk=>chunk.type=='IDAT').data; // my dataset is limited to 1 IDAT chunk
    return pixelData;
}
let getIndex = (x,y,width)=>(y+width*x)*4
let getXY = (index,width)=>[(index%(width*4))/4,Math.floor(index/width/4)]
let traverseImage = (startIndexAndRow,data,hasSeen={},isInitial=true)=>{
    let width = 100
    let [y,x] = startIndexAndRow
    let index = (y+width*x)*4
    let hasSeenIndex = hasSeen[index]
    if(hasSeenIndex)return hasSeenIndex
    if(data[index]!==0)return;
    hasSeen[index]=true
    let surrounding = [
        [y,x-1],
        [y,x+1],
        [y-1,x],
        [y+1,x],
    ]
    surrounding.filter(([x,y])=>{
        return x>=0&&y>=0&&x<width&&y<30&&!hasSeen[getIndex(x,y,width)]
    }).forEach(([x,y])=>{
        traverseImage([x,y],data,hasSeen,false)
    })
    if(!isInitial)return false
    return hasSeen
}
let known = {}
if(fs.existsSync('known.json')){
    known = JSON.parse(fs.readFileSync('known.json'))
}else fs.writeFileSync('known.json',"{}")
let knownNumbers = Object.fromEntries(Object.entries(known).map(e=>[e[1].join(""),e[0]]))
let getImageCharacters = (filePathOrBuffer,forTraining=false,overwrite=false,time)=>{
    let start = Date.now()
    let data
    if(typeof filePathOrBuffer==='string'){
        if(!fs.existsSync(filePathOrBuffer))return console.error('Input was string and assumed to be a file path, but file does not exist')
        data = fs.readFileSync(filePathOrBuffer)
    }else if(Buffer.isBuffer(filePathOrBuffer)){
        data = filePathOrBuffer
    }else{
        return console.error('Input was not a string or buffer')
    }
    let pngFile = parsePNG(data)
    data = getPixelData(pngFile)
    let width = pngFile.chunks.find(chunk=>chunk.type=='IHDR').data.width
    /* Will not be neccesary as we will not be using the actual pallete but this is how I would do it otherwise
    for(let i=0;i<data.length;i+=4){
        let none255 = +(data[i]!=255||data[i+1]!=255||data[i+2]!=255)
        // if the pixel is not white, make it white
        // otherwise make it black
        data[i]=none255&&255
        data[i+1]=none255&&255
        data[i+2]=none255&&255
    }
    */
let starters = []
let maxInd = data.length/4
for(let i=0;i<maxInd;i+=width){
    let lastAboveBlack = false
    if(data[i*4+width*4]==0){
        let currentLine = i/width
       for(let q = 0;q<width;q++){
        let tempLast = lastAboveBlack
        let hasAnyBlackAbove = false
        let anyBlackAbove;
        for(let w = 0;w<currentLine-1;w++){
            if(data[getIndex(w,q,width)]===0){
                hasAnyBlackAbove=true
                anyBlackAbove=w
                break
            }
        }
        let followingLine = (i+q+width)*4
        if(!hasAnyBlackAbove){
                data[followingLine]=255
                data[followingLine+1]=255
                data[followingLine+2]=255
        }else 
            if(!tempLast){
               starters.push([q,anyBlackAbove])
            }
            lastAboveBlack = hasAnyBlackAbove
        }
    }
}
    let keyArrays = starters.map(e=>{
        let coords = Object.keys(traverseImage(e,data)).sort((x,y)=>x-y).map(e=>getXY(e,width))
        let minX = Math.min(...coords.map(e=>e[0]))
        let minY = Math.min(...coords.map(e=>e[1]))
        return coords.map(e=>[e[0]-minX,e[1]-minY]).sort((x,y)=>x[1]-y[1])
    })
    if(!forTraining){
        let result = keyArrays.map((e,i)=>[i,knownNumbers[e.join("")],e])
        if(result.filter(e=>e[1]).length!=6){
            console.error("Error: Could not find all characters, training is probably incomplete")
            fs.writeFileSync("error.json",JSON.stringify(result.filter(e=>!e[1]).map(e=>[e[0],e[2]])))
        }
        let end = Date.now()
        if(time)console.info("Time taken:",end-start,"ms")
        return result.map(e=>e[1]).join("")
    }
    if(typeof filePathOrBuffer==='string'){
    let fileName = filePathOrBuffer.split("/").pop().split(".").shift()
    if(!fileName||(fileName&&fileName.length!=6))return
    let hasError = false
    let hasUpdated = false
    for(let i = 0;i<keyArrays.length;i++){
        let e = keyArrays[i]
        let char = fileName[i]
        if(known[char]){
            if(known[char].join(".")!=e.join(".")){
                if(overwrite){
                    known[char]=e
                    hasUpdated=true
                    continue
                }
                console.error("Error",char,e,known[char])
                hasError=true
                break
            }
        }else{
            known[char]=e
            hasUpdated=true
        }
    } 
    if(!hasError&&hasUpdated)fs.writeFileSync("./known.json",JSON.stringify(known))
}
}
let trainKnown = ()=>{
    console.info("Currently known characters:")
    let tempKnown = {...known}
    let knownChars = Object.keys(known)
    console.info(knownChars.join(", "))
    fs.readdirSync("./known").filter(e=>e.endsWith(".png")).forEach(e=>{
        getImageCharacters(`./known/${e}`,true)
    })
    let learnedChars = Object.keys(known).filter(e=>!tempKnown[e])
    if(learnedChars.length){
        console.info("Learned new characters:")
        console.info(learnedChars.join(", "))
        knownNumbers = Object.fromEntries(Object.entries(known).map(e=>[e[1].join(""),e[0]]))
    }else{
        console.info("No new characters learned")
    }
}
if(process.argv.length>=3){
let opts = Object.fromEntries(process.argv.filter(e=>e.startsWith("-")).map(e=>[e,1]))
process.argv = process.argv.filter(e=>!e.startsWith("-"))
if(process.argv[2]==="train"){
    trainKnown()
}else if(process.argv[2]==="solve"){
    process.argv.slice(3).forEach(e=>{
        console.info(getImageCharacters(e,false,false,opts["--time"]||opts["-t"]))
    })
}
process.exit(0)
}
stdin.on('data', async (buffer) => {
    try{
        let e = buffer.toString()
        let evaled = eval(e)
        if(evaled&&evaled.then){
            evaled = await evaled
        }
        console.info(evaled)
    }
    catch(e){
        console.error(e)
    }
});
stdin.on('end', () => {
    process.exit(0);
});