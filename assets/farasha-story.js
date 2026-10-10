function initialize(root){
'use strict';
const abort=new AbortController();let frameId;
function headerOffset(){return parseFloat(getComputedStyle(root).getPropertyValue('--farasha-header-offset'))||0;}
function listen(target,event,handler,options={}){target.addEventListener(event,handler,{...options,signal:abort.signal});}
const config=JSON.parse(root.querySelector('[data-role="config"]').textContent),labels=config.labels;
const rawChapters=config.chapters;
const chapters=rawChapters.map((c,idx)=>({...c,originalIndex:c.originalIndex??idx})).filter(c=>!c.hidden);
const story=root,host=root.querySelector('[data-role="chapters"]'),dots=root.querySelector('[data-role="dots"]'),flyer=root.querySelector('[data-role="flyer"]'),body=root.querySelector('[data-role="butterflyBody"]'),bloom=root.querySelector('[data-role="sunBloom"]'),white=root.querySelector('[data-role="whiteFinish"]'),instruction=root.querySelector('[data-role="instruction"]'),motion=root.querySelector('[data-role="motion"]');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let current=0,from=0,to=0,transitionStart=0,duration=0,busy=false,ambientPaused=reduced.matches,ambientTime=0,lastTime=0,progress=0,finale=0;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10)},lerp=(a,b,t)=>a+(b-a)*t;

function isStoryInView(){
 const rect=story.getBoundingClientRect();
 const offset=headerOffset();
 return rect.top <= offset + 150 && rect.bottom >= offset + 200;
}

const finaleVideo=root.querySelector('[data-role="finaleVideo"]');
const finaleShade=root.querySelector('[data-role="finaleShade"]');
const finalePoster=root.querySelector('[data-role="finalePoster"]');
let videoReady=false,videoWanted=false;
if(finaleVideo){
 finaleVideo.muted=true;
 const initPlay=finaleVideo.play();
 if(initPlay)initPlay.then(()=>{videoReady=true;}).catch(()=>{});
 listen(finaleVideo,'loadeddata',()=>{videoReady=true;});
 listen(finaleVideo,'canplay',()=>{videoReady=true;});
 listen(finaleVideo,'playing',()=>{videoReady=true;});
 listen(finaleVideo,'error',()=>{videoReady=false;});
}
function updateFinaleVideo(){
 if(!finaleVideo)return;
 const wanted=!!config.finaleVideoUrl&&finale>0&&!ambientPaused&&!document.hidden;
 if(wanted!==videoWanted){
  videoWanted=wanted;
  if(wanted){
   const attempt=finaleVideo.play();
   if(attempt)attempt.then(()=>{videoReady=true;}).catch(()=>{videoWanted=false;});
  }else finaleVideo.pause();
 }
 const reveal=smooth((finale-.55)/.45);
 if(finalePoster)finalePoster.style.opacity=(reveal>0&&!videoReady)?reveal:0;
 finaleVideo.style.opacity=reveal;
 if(finaleShade)finaleShade.style.opacity=reveal*(config.finaleOverlayOpacity??.4);
}

const nodes=chapters.map((c,i)=>{
 const el=document.createElement('article');
 el.className='chapter'+(c.intro?' intro':'')+(c.finale?' finale':'');
 el.setAttribute('aria-hidden',i?'true':'false');
 el.inert=i!==0;

 if(c.chapterType==='welcome'||c.originalIndex===0){
  el.classList.add('opening-slide');
  const welcome=document.createElement('h1');
  welcome.textContent=c.title||'Welcome';
  el.append(welcome);
  if(c.kiyaaraLogo){
   const img=new Image();
   img.className='opening-art opening-kiyaara';
   img.src=c.kiyaaraLogo;
   img.alt='Kiyaara';
   el.append(img);
  }
  if(c.button){
   const button=document.createElement('button');
   button.className='cta';
   button.type='button';
   button.textContent=c.button;
   button.onclick=e=>{e.stopPropagation();go(1);};
   el.append(button);
  }
 }else if(c.chapterType==='collection_intro'||c.originalIndex===1){
  el.classList.add('opening-slide','collection-opening');
  if(c.collectionLogo){
   const img=new Image();
   img.className='opening-art opening-collection';
   img.src=c.collectionLogo;
   img.alt='The Farasha collection';
   el.append(img);
  }
  if(c.videoUrl || c.videoPoster){
   const media=document.createElement('div');
   media.className='collection-video-placeholder';
   if(c.videoUrl && (c.videoUrl.includes('.mp4') || c.videoUrl.includes('cdn.shopify.com'))){
    const video=document.createElement('video');
    video.src=c.videoUrl;
    video.autoplay=true;
    video.loop=true;
    video.muted=true;
    video.playsInline=true;
    if(c.videoPoster) video.poster=c.videoPoster;
    media.append(video);
   }else if(c.videoPoster){
    const poster=new Image();
    poster.src=c.videoPoster;
    poster.alt='Collection video';
    media.append(poster);
   }
   el.append(media);
  }
  if(c.description){
   const p=document.createElement('p');
   p.textContent=c.description;
   el.append(p);
  }
 }else{
  if(c.image && !c.finale){
   const slot=document.createElement('div');slot.className='motif-slot';
   if(c.image==='butterfly.png'){
    const canvas=document.createElement('canvas');canvas.className='motif chapter-butterfly';canvas.width=602;canvas.height=372;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Butterfly fluttering its wings in place');slot.append(canvas);
   }else{
    const img=new Image();img.className='motif';img.src=c.image;img.alt=c.finale?labels.products_alt:(c.label||'').toLowerCase();slot.append(img);
   }
   el.append(slot);
  }
  if(c.label){
   const label=document.createElement('span');label.className='eyebrow';label.textContent=c.label;
   el.append(label);
  }
  if(c.title){
   const title=document.createElement('h2');title.textContent=c.title;el.append(title);
  }
  if(c.description){
   const p=document.createElement('p');p.textContent=c.description;el.append(p);
  }
  if(c.button){const button=document.createElement('button');button.className='cta';button.type='button';button.textContent=c.button;button.onclick=e=>{e.stopPropagation();if(config.collectionUrl)location.href=config.collectionUrl;};if(c.finale&&!config.collectionUrl){button.setAttribute('aria-disabled','true');button.title=labels.unlinked;}el.append(button);}
 }

 host.append(el);
 const dot=document.createElement('button');dot.className='dot';dot.type='button';dot.setAttribute('aria-label',`${i+1}. ${c.title||''}`);dot.onclick=e=>{e.stopPropagation();go(i);};dots.append(dot);
 return el;
});
const dotButtons=[...dots.children];

const desktop=[[.16,.81],[.33,.83],[.43,.84],[.64,.84],[.84,.79],[.73,.83],[1.050,1.250],[1.14,.12]];
const mobile=[[.19,.86],[.38,.87],[.56,.87],[.76,.86],[.64,.85],[.35,.88],[1.050,1.250],[1.25,.12]];
const flowerLandings={2:[.454,.814],3:[.678,.830],4:[.756,.638],5:[.550,.792]};

function sync(){
 const lastIdx=chapters.length-1;
 nodes.forEach((n,i)=>{const active=i===current;n.inert=!active;n.setAttribute('aria-hidden',String(!active));});
 dotButtons.forEach((d,i)=>{if(i===current)d.setAttribute('aria-current','step');else d.removeAttribute('aria-current');});
 root.querySelector('[data-role="previous"]').disabled=current===0;root.querySelector('[data-role="next"]').setAttribute('aria-label',current===lastIdx?labels.continue_page:labels.next);
 instruction.textContent=current===lastIdx?labels.end:current===0?labels.begin:labels.continue;
 root.querySelector('[data-role="announcement"]').textContent=`${current+1} ${labels.position} ${chapters.length}. ${chapters[current].title||''}`;
}
function go(target){
 const lastIdx=chapters.length-1;
 if(busy||target===current||target<0)return;
 if(target>=chapters.length){leave();return;}
 if(Math.abs(story.getBoundingClientRect().top-headerOffset())>12)window.scrollTo({top:window.scrollY+story.getBoundingClientRect().top-headerOffset(),behavior:'instant'});
 from=current;to=target;progress=0;busy=true;transitionStart=performance.now();duration=reduced.matches?180:(from===lastIdx||to===lastIdx?config.finaleMs:((from<6)!==(to<6)?config.finaleMs*1.8:config.transitionMs));
 nodes[from].classList.add('active');nodes[to].classList.add('active');nodes[from].inert=true;nodes[to].inert=true;
}
function leave(){if(busy)return;window.scrollTo({top:window.scrollY+story.getBoundingClientRect().bottom-headerOffset(),behavior:reduced.matches?'instant':'smooth'});}
function paintChapter(n,opacity){n.style.opacity=opacity;n.style.filter=reduced.matches?'none':`blur(${(1-opacity)*5}px)`;}
function tick(now){
 const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;if(!ambientPaused&&!document.hidden)ambientTime+=dt;

 root.querySelectorAll('.chapter .motif').forEach(motif=>{
  const lift=reduced.matches?0:4*(1-Math.cos(ambientTime*1.4));
  const isFinal=!!motif.closest('.finale');
  const isButterfly=motif.classList.contains('chapter-butterfly');
  const scale=isFinal?1.4*(1-.18*finale):(isButterfly?1.6:1.5);
  if(isFinal)motif.style.opacity=1-finale;
  const yOffset=isButterfly?4:-18;
  motif.style.transform=`translateY(${yOffset - lift}px) scale(${scale})`;
 });

 const chapterButterfly=root.querySelector('.chapter-butterfly'),chapterAtlas=root.querySelector('[data-role="chapterButterflyFrames"]');
 if(chapterButterfly&&chapterAtlas&&chapterAtlas.complete&&chapterAtlas.naturalWidth){
  const ctx=chapterButterfly.getContext('2d');ctx.clearRect(0,0,602,372);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const frame=reduced.matches?27:29-25*Math.cos(ambientTime*2*Math.PI/4.15);
  const a=Math.floor(frame),b=Math.ceil(frame),blend=frame-a;
  ctx.globalCompositeOperation='lighter';
  for(const [index,weight] of [[a,1-blend],[b,blend]]){
   ctx.globalAlpha=weight;
   ctx.drawImage(chapterAtlas,(index%9)*640,Math.floor(index/9)*360,640,360,0,16.6875,602,338.625);
  }
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 }

 if(busy){
  progress=clamp((now-transitionStart)/duration);
  const lastIdx=chapters.length-1;
  paintChapter(nodes[from],1-smooth(progress/.43));
  paintChapter(nodes[to],smooth((progress-.48)/.43));
  finale=lerp(from===lastIdx?1:0,to===lastIdx?1:0,smooth(progress));
  if(progress>=1){if(nodes[from]!==nodes[to]){nodes[from].classList.remove('active');paintChapter(nodes[from],0);}current=to;busy=false;paintChapter(nodes[current],1);sync();}
 }
 bloom.style.opacity=smooth(finale/.22);bloom.style.transform=`scale(${smooth(finale/.65)*6})`;
 white.style.opacity=smooth((finale-.30)/.32)*(1-smooth((finale-.55)/.45));
 updateFinaleVideo();

 const rect=story.getBoundingClientRect();
 const foreground=root.querySelector('.land.foreground').getBoundingClientRect();
 const activeLandings=innerWidth<=700?{2:[.780,.875],3:[.678,.830],4:[.756,.638],5:[.550,.792]}:flowerLandings;
 const points=(innerWidth<=700?mobile:desktop).map((point,index)=>{
  const origIdx=chapters[index]?.originalIndex??index;
  const flower=activeLandings[origIdx];
  const basePoint=(innerWidth<=700?mobile:desktop)[origIdx]||point;
  if(!flower)return basePoint;
  return [(foreground.left-rect.left+flower[0]*foreground.width)/rect.width,
   (foreground.top-rect.top+flower[1]*foreground.height-flyer.offsetHeight*.32)/rect.height];
 });

 let x,y,heading;
 if(busy){const a=points[from],b=points[to],f=smooth(progress);x=lerp(a[0],b[0],f);y=lerp(a[1],b[1],f)-Math.sin(Math.PI*f)*(innerWidth<=700?.055:.065);heading=b[0]>=a[0]?12:-12;}else{[x,y]=points[current];const origIdx=chapters[current]?.originalIndex??current;heading=activeLandings[origIdx]?0:Math.sin(ambientTime*.65)*5;}
 const origFrom=chapters[from]?.originalIndex??from,origTo=chapters[to]?.originalIndex??to,origCurrent=chapters[current]?.originalIndex??current;
 const drift=busy?lerp(activeLandings[origFrom]?0:1,activeLandings[origTo]?0:1,smooth(progress)):(activeLandings[origCurrent]?0:1);
 const hover=ambientPaused?0:drift;
 x=x*rect.width+Math.sin(ambientTime*1.2)*8*hover;y=y*rect.height+Math.sin(ambientTime*2.2)*5*hover;

 flyer.style.transform=`translate3d(${x-flyer.offsetWidth/2}px,${y-flyer.offsetHeight/2}px,0) scale(${.35+.65*(busy?lerp(origFrom<6?1:0,origTo<6?1:0,smooth(progress)):origCurrent<6?1:0)})`;
 const previousHeading=Number(body.dataset.angle||0),angle=lerp(previousHeading,heading,1-Math.exp(-dt*5));body.dataset.angle=angle;body.style.transform=`rotate(${angle}deg)`;

 const atlas=root.querySelector('[data-role="butterflyFrames"]'),sideAtlas=root.querySelector('[data-role="butterflySideFrames"]'),canvas=root.querySelector('[data-role="butterflyV"]');
 if(atlas.complete&&atlas.naturalWidth){
  const c=canvas.getContext('2d');c.clearRect(0,0,200,150);
  const sideReady=sideAtlas.complete&&sideAtlas.naturalWidth;
  const sideWeight=busy&&sideReady?smooth(progress/.23)*(1-smooth((progress-.77)/.23)):0;
  function drawPose(image,frame,fw,fh,crop,opacity,mirror){
   if(opacity<=0)return;
   const i=Math.floor(frame),j=Math.ceil(frame),blend=frame-i;
   c.save();if(mirror){c.translate(200,0);c.scale(-1,1);}
   c.globalCompositeOperation='lighter';
   for(const [index,alpha] of [[i,1-blend],[j,blend]]){
    c.globalAlpha=alpha*opacity;
    c.drawImage(image,(index%9)*fw+crop[0],Math.floor(index/9)*fh+crop[1],crop[2],crop[3],0,0,200,150);
   }
   c.restore();
  }
  const phase=ambientTime*2*Math.PI*2.2;
  drawPose(atlas,15+15*Math.sin(phase),280,158,[62,12,156,112],1-sideWeight,false);
  if(sideReady)drawPose(sideAtlas,22+22*Math.sin(phase),325,183,[90,25,170,130],sideWeight,busy&&points[to][0]<points[from][0]);
 }

 const presence=busy?lerp(origFrom<6?1:0,origTo<6?1:0,smooth(progress)):(origCurrent<6?1:0);flyer.style.opacity=presence*(1-smooth((finale-.35)/.5));

 root.querySelectorAll('.cloud').forEach((c,i)=>{
  const width=rect.width,cloudWidth=c.offsetWidth,start=parseFloat(getComputedStyle(c).left)||0;
  const distance=width+cloudWidth+80,speed=(innerWidth<=700?5:10)+i*.7;
  let travel=ambientTime*speed*(i%2===0?1:-1),position=((start+travel+cloudWidth+40)%distance+distance)%distance-cloudWidth-40;
  c.style.transform=`translate3d(${position-start}px,${Math.sin(ambientTime*.3+i)*3}px,0)`;
 });
 frameId=requestAnimationFrame(tick);
}

let wheelTime=-1000,wheelTotal=0,wheelConsumed=false;
function handleWheel(e){
 const lastIdx=chapters.length-1;
 if(e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!e.deltaY)return;
 if(!isStoryInView())return;

 const now=performance.now();
 if(now-wheelTime>220){wheelTotal=0;wheelConsumed=false;}
 wheelTime=now;

 if(current===lastIdx&&!busy&&e.deltaY>0)return;
 if(current===0&&!busy&&e.deltaY<0)return;

 e.preventDefault();
 if(busy||wheelConsumed)return;

 const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
 wheelTotal+=delta;

 if(Math.abs(wheelTotal)>18){
  wheelConsumed=true;
  go(current+Math.sign(wheelTotal));
 }
}

listen(window,'wheel',handleWheel,{passive:false});
listen(story,'wheel',handleWheel,{passive:false});

listen(story,'click',e=>{if(e.target.closest('button,a,input,nav')||getSelection()?.toString())return;if(performance.now()-lastSwipe<500)return;go(current+1);});
root.querySelector('[data-role="previous"]').onclick=e=>{e.stopPropagation();go(current-1);};root.querySelector('[data-role="next"]').onclick=e=>{e.stopPropagation();go(current+1);};

listen(window,'keydown',e=>{
 if(e.target.closest('button,a,input,textarea,select'))return;
 if(!isStoryInView())return;
 if(['ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();go(current+1);}
 else if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();go(current-1);}
});

let touchStart=null,lastSwipe=-1000;
listen(story,'touchstart',e=>{if(e.touches.length===1)touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};else touchStart=null;},{passive:true});
listen(story,'touchmove',e=>{
 const lastIdx=chapters.length-1;
 if(!touchStart||e.touches.length!==1)return;
 const dy=touchStart.y-e.touches[0].clientY;
 if(isStoryInView()&&(busy||(dy>0&&current<lastIdx)||(dy<0&&current>0)))e.preventDefault();
},{passive:false});
listen(story,'touchend',e=>{
 const lastIdx=chapters.length-1;
 if(!touchStart)return;
 const dx=touchStart.x-e.changedTouches[0].clientX,dy=touchStart.y-e.changedTouches[0].clientY;
 touchStart=null;
 if(Math.abs(dy)>30&&Math.abs(dy)>Math.abs(dx)&&isStoryInView()){
  lastSwipe=performance.now();
  if(!(current===lastIdx&&dy>0)&&!(current===0&&dy<0))go(current+Math.sign(dy));
 }
},{passive:true});

function syncMotion(){motion.textContent=ambientPaused?labels.resume:labels.pause;motion.setAttribute('aria-pressed',String(ambientPaused));motion.setAttribute('aria-label',ambientPaused?labels.resume_label:labels.pause_label);}
motion.onclick=e=>{e.stopPropagation();ambientPaused=!ambientPaused;syncMotion();};listen(reduced,'change',()=>{ambientPaused=reduced.matches;syncMotion();});

nodes[0].classList.add('active');paintChapter(nodes[0],1);sync();syncMotion();frameId=requestAnimationFrame(tick);
return ()=>{abort.abort();cancelAnimationFrame(frameId);};
}
if(!customElements.get('farasha-garden'))customElements.define('farasha-garden',class extends HTMLElement{connectedCallback(){if(this.cleanup)return;this.cleanup=initialize(this);}disconnectedCallback(){this.cleanup?.();this.cleanup=null;this.querySelector('[data-role="chapters"]')?.replaceChildren();this.querySelector('[data-role="dots"]')?.replaceChildren();}});