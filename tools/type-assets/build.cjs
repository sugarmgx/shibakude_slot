const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),opentype=require('opentype.js');
const root=path.resolve(__dirname,'../..');
const source=['app.js','visual-effects.js'].map(f=>fs.readFileSync(path.join(root,'app',f),'utf8')).join('');
const chars=new Set([...source,...Array.from({length:95},(_,i)=>String.fromCharCode(32+i))]);
const font=opentype.loadSync(process.argv[2]||path.join(__dirname,'NotoSansCJKjp-Black.otf'));
const glyphs={};
// CFF outlines in this font wind opposite to Three's typeface convention.
// Reverse each closed contour, including Bezier controls, not just endpoints.
function reverseContours(commands){
 const output=[];let segments=[],start=null,current=null;
 const flush=()=>{if(!start)return;output.push({type:'M',x:current.x,y:current.y});
  for(const {from,to} of segments.reverse()){
   if(to.type==='C')output.push({type:'C',x:from.x,y:from.y,x1:to.x2,y1:to.y2,x2:to.x1,y2:to.y1});
   else if(to.type==='Q')output.push({type:'Q',x:from.x,y:from.y,x1:to.x1,y1:to.y1});
   else output.push({type:'L',x:from.x,y:from.y});
  }output.push({type:'Z'});segments=[];start=null;};
 for(const p of commands){if(p.type==='M'){flush();start=current=p;}else if(p.type==='Z'){flush();}else{segments.push({from:current,to:p});current=p;}}flush();return output;
}
for(const c of chars){if(!font.charToGlyphIndex(c))continue;const g=font.charToGlyph(c),b=g.getBoundingBox();let out=[];
for(const p of reverseContours(g.path.commands)){const q=n=>Math.round(n*100)/100;if(p.type==='M'||p.type==='L')out.push(p.type.toLowerCase(),q(p.x),q(p.y));if(p.type==='Q')out.push('q',q(p.x),q(p.y),q(p.x1),q(p.y1));if(p.type==='C')out.push('b',q(p.x),q(p.y),q(p.x1),q(p.y1),q(p.x2),q(p.y2));}
glyphs[c]={ha:g.advanceWidth,x_min:b.x1,x_max:b.x2,o:out.join(' ')};}
const typeface={glyphs,familyName:'Slot Noto Sans CJK JP Black Subset',resolution:font.unitsPerEm,boundingBox:{yMin:font.descender,yMax:font.ascender},underlineThickness:50};
fs.writeFileSync(path.join(root,'assets/fonts/slot-black.typeface.json'),JSON.stringify(typeface));
fs.writeFileSync(path.join(root,'assets/fonts/slot-black.typeface.js'),`window.SlotBlackTypeface=${JSON.stringify(typeface)};\n`);
if(process.argv.includes('--font-only')){console.log('font glyphs',Object.keys(glyphs).length);process.exit(0);}
esbuild.build({stdin:{contents:"import {EXRLoader} from 'three/examples/jsm/loaders/EXRLoader.js'; import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js'; window.CabinetAssets={EXRLoader,FontLoader};",resolveDir:__dirname},bundle:true,minify:true,format:'iife',outfile:path.join(root,'assets/vendor/cabinet-assets.js'),plugins:[{name:'shared-three',setup(build){build.onResolve({filter:/^three$/},()=>({path:'shared',namespace:'global'}));build.onLoad({filter:/.*/,namespace:'global'},()=>({contents:'export const {DataTextureLoader,DataUtils,FloatType,HalfFloatType,LinearEncoding,LinearFilter,RedFormat,RGBAFormat,FileLoader,Loader,ShapePath}=window.THREE;',loader:'js'}));}}]}).catch(e=>{console.error(e);process.exitCode=1;});
console.log('font glyphs',Object.keys(glyphs).length);
