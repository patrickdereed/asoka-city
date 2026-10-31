// What the shops sell and the shop panel. The game passes in a small interface (money, the arsenal,
// healing, previews) so this file only knows about prices and menus.
import { WEAPONS, WEAPON, CATEGORIES, ARMOUR, fmtMoney } from "./weapons.js";
import { PEOPLE } from "./peoplelist.js";

export const MART = [
  { id: "coffee", name: "Cold brew", note: "+15 health", price: 4, hp: 15 },
  { id: "salad", name: "Standup salad", note: "+25 health", price: 8, hp: 25 },
  { id: "burrito", name: "Deploy Day burrito", note: "+45 health", price: 12, hp: 45 },
  { id: "firstaid", name: "First aid kit", note: "Back to full health", price: 140, hp: 100 },
  { id: "scratch", name: "Rollout scratch card", note: "Win up to $5,000. Most cards lose.", price: 25, scratch: true },
];

// Every look is for sale here; suits cost more.
export function outfitPrice(id) {
  const i = PEOPLE.findIndex((p) => p.id === id), p = PEOPLE[i];
  return p.kind === "business" ? 1100 + (i % 4) * 200 : 240 + (i % 5) * 95;
}

export const lookName = (p, i) => `${p.kind === "business" ? "Business" : "Casual"} look ${i + 1}`;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Scratch card: a 1 in 3 chance of something; small prizes most of the time.
export function scratchPrize(r = Math.random()) {
  if (r < 0.002) return 5000;
  if (r < 0.012) return 500;
  if (r < 0.06) return 100;
  if (r < 0.16) return 40;
  if (r < 0.34) return 25;
  return 0;
}

// game: { root, money(), spend(n), earn(n), arsenal, save, heal(n), hp(), armor(), setArmor(n),
//         previewWeapon(id|null), previewLook(id|null), wear(id), close(), toast(msg), venue, buyHome(), sound(up) }
export function openShop(kind, game) {
  const root = game.root;
  let tab = 0, sel = null;
  const cats = kind === "arms" ? [...CATEGORIES.map(([n]) => n), "Armour"] : null;

  const header = () => {
    const v = game.venue;
    const sub = { arms: "Weapons and ammunition", mart: "Open 24/7", threads: "Outfits", clinic: "Walk-in care", wardrobe: "Your wardrobe", home: "For sale" }[kind];
    return `<header><span>${esc(sub)}</span><b>${esc(kind === "wardrobe" ? "Wardrobe" : v.name)}</b><i>${fmtMoney(game.money())}</i></header>`;
  };

  const render = () => {
    let tabs = "", items = [], detail = "";
    if (kind === "arms") {
      tabs = `<div class="tabs">${cats.map((c, i) => `<button data-tab="${i}" class="${i === tab ? "on" : ""}">${c}</button>`).join("")}</div>`;
      if (cats[tab] === "Armour") {
        items = [{ id: "armour", name: ARMOUR.name, sub: `Absorbs ${ARMOUR.amount} damage`, price: game.armor() >= 100 ? "Full" : fmtMoney(ARMOUR.price), cls: game.armor() >= 100 ? "owned" : game.money() < ARMOUR.price ? "cant" : "" }];
      } else {
        const slots = CATEGORIES[tab][1];
        items = WEAPONS.filter((w) => slots.includes(w.slot)).map((w) => {
          const own = !!game.save.weapons[w.id];
          const buyAmmo = own || w.throw;
          const price = buyAmmo ? (game.arsenal.ammoFull(w.id) ? "Full" : `${fmtMoney(w.ammoPrice)}`) : fmtMoney(w.price);
          const cost = buyAmmo ? w.ammoPrice : w.price;
          return { id: w.id, name: w.name, sub: `${w.kind}${own && w.mag ? ` · ${game.save.weapons[w.id].mag + game.save.weapons[w.id].ammo} rounds` : ""}${buyAmmo && w.ammoPack ? ` · ammo ×${w.ammoPack}` : ""}`, price, cls: own && !w.mag ? "owned" : game.money() < cost ? "cant" : own ? "owned" : "" };
        });
      }
    } else if (kind === "mart") {
      items = MART.map((m) => ({ id: m.id, name: m.name, sub: m.note, price: fmtMoney(m.price), cls: game.money() < m.price ? "cant" : "" }));
    } else if (kind === "threads" || kind === "wardrobe") {
      const owned = game.save.outfits;
      const list = kind === "wardrobe" ? PEOPLE.filter((p) => owned.includes(p.id)) : PEOPLE;
      items = list.map((p) => {
        const i = PEOPLE.indexOf(p), own = owned.includes(p.id), worn = game.save.look === p.id;
        return { id: p.id, name: lookName(p, i), sub: worn ? "Wearing" : own ? "Owned" : p.kind === "business" ? "Tailored suit" : "Casual", price: worn ? "Worn" : own ? "Wear" : fmtMoney(outfitPrice(p.id)), cls: own ? "owned" : game.money() < outfitPrice(p.id) ? "cant" : "" };
      });
    } else if (kind === "clinic") {
      const need = 100 - game.hp(), cost = need > 0 ? Math.max(25, Math.round(need * 2.5)) : 0;
      items = [{ id: "heal", name: "Patch me up", sub: need > 0 ? `Restores ${Math.round(need)} health` : "You're in good shape", price: need > 0 ? fmtMoney(cost) : "—", cls: need > 0 && game.money() < cost ? "cant" : "" }];
    } else if (kind === "home") {
      const v = game.venue;
      items = [{ id: "buy", name: `Buy ${v.name}`, sub: "Sleep here to save; keep your outfits in the wardrobe", price: fmtMoney(v.price), cls: game.money() < v.price ? "cant" : "" }];
    }
    if (!sel || !items.some((i) => i.id === sel)) sel = items[0] && items[0].id;
    detail = detailFor(sel);
    root.innerHTML = `<div class="shop" role="dialog" aria-label="Shop">${header()}${tabs}<ul>${items.map((i) => `<li><button data-id="${i.id}" class="${i.cls || ""} ${i.id === sel ? "on" : ""}"><span>${esc(i.name)}</span><em>${esc(i.price)}</em><small>${esc(i.sub)}</small></button></li>`).join("")}</ul>${detail}</div>`;
    root.classList.remove("hidden");
    root.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { tab = +b.dataset.tab; sel = null; render(); });
    root.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => { sel = b.dataset.id; preview(); render(); });
    root.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act));
    preview();
  };

  const bar = (label, f) => `<b>${label}</b><span><i style="width:${Math.round(Math.max(0.04, Math.min(1, f)) * 100)}%"></i></span>`;

  const detailFor = (id) => {
    const close = `<button class="btn" data-act="close">Leave <kbd>Esc</kbd></button>`;
    if (kind === "arms" && WEAPON[id]) {
      const w = WEAPON[id], own = !!game.save.weapons[id];
      const stats = `<div class="stats">${bar("Damage", (w.dmg * (w.pellets || 1)) / 200)}${bar("Fire rate", Math.log(1 + w.rate) / Math.log(31))}${w.range > 3 ? bar("Range", Math.sqrt(w.range / 600)) : ""}${w.spread != null ? bar("Accuracy", 1 - Math.sqrt(w.spread / 0.11)) : ""}${w.mag ? bar("Magazine", Math.log(1 + w.mag) / Math.log(501)) : ""}</div>`;
      const buyBtn = !own && !w.throw ? `<button class="btn primary" data-act="buy" ${game.money() < w.price ? "disabled" : ""}>Buy · ${fmtMoney(w.price)}</button>` : "";
      const ammoBtn = (own || w.throw) && w.mag ? `<button class="btn ${own ? "primary" : "primary"}" data-act="ammo" ${game.money() < w.ammoPrice || game.arsenal.ammoFull(id) ? "disabled" : ""}>${w.throw ? `Buy ${w.ammoPack}` : `Ammo ×${w.ammoPack}`} · ${fmtMoney(w.ammoPrice)}</button>` : "";
      return `<div class="detail"><p>${esc(w.kind)}.${w.auto ? " Fully automatic." : ""}${w.proj ? " Explosive." : ""}${w.scope ? " Scoped: hold right mouse to look through it." : ""}</p>${stats}<div class="row">${buyBtn}${ammoBtn}${close}</div></div>`;
    }
    if (kind === "arms" && id === "armour") return `<div class="detail"><p>Takes the hit before your health does. Tops you up to ${ARMOUR.amount}.</p><div class="row"><button class="btn primary" data-act="armour" ${game.armor() >= 100 || game.money() < ARMOUR.price ? "disabled" : ""}>Buy · ${fmtMoney(ARMOUR.price)}</button>${close}</div></div>`;
    if (kind === "mart") { const m = MART.find((x) => x.id === id); return `<div class="detail"><p>${esc(m.note)}</p><div class="row"><button class="btn primary" data-act="mart" ${game.money() < m.price ? "disabled" : ""}>Buy · ${fmtMoney(m.price)}</button>${close}</div></div>`; }
    if (kind === "threads" || kind === "wardrobe") {
      const own = game.save.outfits.includes(id), worn = game.save.look === id;
      const btn = worn ? `<button class="btn" disabled>Wearing it</button>` : own ? `<button class="btn primary" data-act="wear">Wear this</button>` : `<button class="btn primary" data-act="outfit" ${game.money() < outfitPrice(id) ? "disabled" : ""}>Buy and wear · ${fmtMoney(outfitPrice(id))}</button>`;
      return `<div class="detail"><p>${kind === "wardrobe" ? "Everything you've bought, ready to wear." : "Every look is open to everyone. Your preview shows in the mirror."}</p><div class="row">${btn}${close}</div></div>`;
    }
    if (kind === "clinic") { const need = 100 - game.hp(), cost = Math.max(25, Math.round(need * 2.5)); return `<div class="detail"><p>The nurse can get you back to full health.</p><div class="row"><button class="btn primary" data-act="heal" ${need <= 0 || game.money() < cost ? "disabled" : ""}>Pay · ${fmtMoney(cost)}</button>${close}</div></div>`; }
    if (kind === "home") { const v = game.venue; return `<div class="detail"><p>Yours for good: a bed that saves your progress and passes the night, and a wardrobe for every outfit you buy.</p><div class="row"><button class="btn primary" data-act="home" ${game.money() < v.price ? "disabled" : ""}>Buy · ${fmtMoney(v.price)}</button>${close}</div></div>`; }
    return `<div class="detail"><div class="row">${close}</div></div>`;
  };

  const preview = () => {
    if (kind === "arms") game.previewWeapon(WEAPON[sel] ? sel : null);
    if (kind === "threads" || kind === "wardrobe") game.previewLook(sel);
  };

  const pay = (n) => { if (!game.spend(n)) { game.toast("Not enough money."); return false; } game.sound(false); return true; };

  const act = (a) => {
    if (a === "close") { game.close(); return; }
    if (a === "buy") { const w = WEAPON[sel]; if (pay(w.price)) { game.arsenal.give(w.id); game.arsenal.select(w.id); game.toast(`${w.name} is yours.`); } }
    if (a === "ammo") { const w = WEAPON[sel]; if (pay(w.ammoPrice)) { game.arsenal.give(w.id); if (w.throw) game.arsenal.select(w.id); } }
    if (a === "armour") { if (pay(ARMOUR.price)) game.setArmor(ARMOUR.amount); }
    if (a === "mart") {
      const m = MART.find((x) => x.id === sel);
      if (pay(m.price)) {
        if (m.hp) game.heal(m.hp);
        if (m.scratch) { const won = scratchPrize(); if (won) { game.earn(won); game.toast(`Scratch card: you won ${fmtMoney(won)}!`); } else game.toast("Scratch card: no win this time."); }
      }
    }
    if (a === "outfit") { if (pay(outfitPrice(sel))) { game.save.outfits.push(sel); game.wear(sel); game.toast("New look. It's in your wardrobe too."); } }
    if (a === "wear") game.wear(sel);
    if (a === "heal") { const need = 100 - game.hp(); if (pay(Math.max(25, Math.round(need * 2.5)))) { game.heal(100); game.toast("All patched up."); } }
    if (a === "home") { if (pay(game.venue.price)) { game.buyHome(); return; } }
    game.saveNow();
    render();
  };

  render();
  return { render, key: (code) => { if (code === "Escape") game.close(); } };
}
