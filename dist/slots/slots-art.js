/* Small vector illustrations, shared by the reels and collectible portraits. */
(()=>{
 const shapes={
 leaf:'<path fill="#b6d3b2" d="M22 71C5 34 42 17 78 20c2 35-17 70-49 56Z"/><path d="m24 78 42-43m-26 26-4-16m16 4 17-2"/>',
 flower:'<g fill="#eab9c7"><ellipse cx="50" cy="31" rx="12" ry="20"/><ellipse cx="50" cy="69" rx="12" ry="20"/><ellipse cx="31" cy="50" rx="20" ry="12"/><ellipse cx="69" cy="50" rx="20" ry="12"/><ellipse transform="rotate(45 50 50)" cx="50" cy="31" rx="12" ry="19"/><ellipse transform="rotate(-45 50 50)" cx="50" cy="31" rx="12" ry="19"/></g><circle cx="50" cy="50" r="13" fill="#f4df9e"/>',
 moon:'<path fill="#eed99f" d="M70 20a34 34 0 1 0 9 58C43 83 27 40 70 20Z"/><path d="M76 31v12m-6-6h12M65 54v7m-3-3h7"/>',
 star:'<path fill="#ead9a5" d="m50 13 10 25 27 4-20 19 4 27-21-13-24 13 5-27-19-19 28-4Z"/><path stroke="#fff8e3" d="m47 28-6 18-13 2"/>',
 seed:'<path fill="#c9b992" d="M28 70c-18-31 9-53 43-50 6 28-7 66-35 59Z"/><path d="m30 73 28-35m-12 15-2-13"/><path stroke="#fff9ed" d="M35 32c-9 8-12 20-8 27"/>',
 koi:'<path fill="#e8c77d" d="m30 54-18-23 4 31-3 16 19-15c24 20 46-2 55-19-16-14-41-16-57 10Z"/><path fill="#f3dfa0" d="m44 42 11-15 7 13m-14 24 14 13 4-19"/><path d="M37 53c9 4 24 4 35-5"/><circle cx="76" cy="44" r="2" fill="#5c6357" stroke="none"/>',
 cow:'<path fill="#f7f0dd" d="M24 30 18 17l17 10h30l17-10-6 15 7 12-8 31H28l-9-31Z"/><path fill="#b8c8b4" d="m29 31 17-3 1 20-13 8-9-10Z"/><path fill="#e9bfcc" d="M25 62q25-19 51 0v14q-24 15-51 0Z"/><path fill="#ecdba5" d="m30 26-4-13 12 12m27 0 10-12-1 15"/><circle cx="38" cy="47" r="2" fill="#5c6357"/><circle cx="63" cy="47" r="2" fill="#5c6357"/><path d="M39 70v3m23-3v3"/>'
 };
 function icon(id,map='pond'){const shape=shapes[id==='friend'?globalThis.SlotsLife.destination(map).art:id]||shapes.seed;return `<svg viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="#637461" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`}
 globalThis.SlotsArt={icon};
})();
