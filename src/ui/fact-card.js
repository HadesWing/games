const card = document.getElementById('fact');
const titleEl = card.querySelector('h3');
const textEl = card.querySelector('p');
const linkEl = card.querySelector('.more');

card.querySelector('.close').addEventListener('click', () => {
  card.hidden = true;
});

/**
 * 弹出知识卡。link 为空时隐藏"百度百科"入口。
 */
export function showFact({ title, text, link }) {
  titleEl.textContent = title;
  textEl.textContent = text;
  if (link) {
    linkEl.href = link;
    linkEl.hidden = false;
  } else {
    linkEl.removeAttribute('href');
    linkEl.hidden = true;
  }
  card.hidden = false;
}

export function hideFact() {
  card.hidden = true;
}
