/* Keep live nodes, focus and scroll while refreshing data. No navigation on refresh. */
(function(global){
  let screenKey=null; const positions=new Map();
  function key(node){
    if(node.nodeType!==1)return '';
    return node.id || [node.tagName,node.getAttribute('data-action')||'',node.getAttribute('data-id')||'',node.getAttribute('data-key')||'',node.getAttribute('data-mode')||'',node.getAttribute('data-tab')||'',node.getAttribute('data-cat')||'',node.getAttribute('data-item')||'',node.getAttribute('data-field')||'',node.getAttribute('data-val')||'',node.getAttribute('data-group')||'',node.getAttribute('type')||''].join(':');
  }
  function compatible(a,b){return a.nodeType===b.nodeType&&(a.nodeType!==1||(a.tagName===b.tagName&&key(a)===key(b)));}
  function patch(old,next){
    if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
    const focused=old===document.activeElement;
    for(const attr of [...old.attributes])if(!next.hasAttribute(attr.name))old.removeAttribute(attr.name);
    for(const attr of [...next.attributes])if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
    if(old.tagName==='INPUT'){
      if(old.type!=='file'&&!focused&&old.value!==next.value)old.value=next.value;
      old.checked=next.checked; old.disabled=next.disabled; return;
    }
    if(old.tagName==='TEXTAREA'){if(!focused)old.value=next.value;return;}
    children(old,next);
    if(old.tagName==='SELECT'&&!focused)old.value=next.value;
  }
  function children(parent,next){
    const old=[...parent.childNodes],used=new Set();let cursor=parent.firstChild;
    for(const wanted of [...next.childNodes]){
      let node=old.find(x=>!used.has(x)&&compatible(x,wanted));
      if(node){used.add(node);patch(node,wanted);}else node=wanted.cloneNode(true);
      if(node!==cursor)parent.insertBefore(node,cursor);
      cursor=node.nextSibling;
    }
    for(const node of old)if(!used.has(node))node.remove();
  }
  global.updateStableApp=function(app,html,nextKey){
    const y=global.scrollY||0,changed=screenKey!==nextKey;
    if(changed&&screenKey)positions.set(screenKey,y);
    const template=document.createElement('template');template.innerHTML=html;
    if(changed)app.replaceChildren(template.content.cloneNode(true));else children(app,template.content);
    screenKey=nextKey;
    const target=changed?(positions.get(nextKey)||0):y;
    if((global.scrollY||0)!==target)global.scrollTo({top:target,behavior:'instant'});
  };
})(window);
