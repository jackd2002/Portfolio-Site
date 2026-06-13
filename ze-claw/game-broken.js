const GRID_SIZE = 7;
const NUM_SYMBOLS = 7;

const SYMBOLS = [
  'assets/gold-teddy.png',
  'assets/unicorn.png',
  'assets/robot.png',
  'assets/duck.png',
  'assets/pink-token.png',
  'assets/blue-token.png',
  'assets/yellow-token.png',
];

function initGrid() {
  const grid = document.getElementById('grid');
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      const sym = Math.floor(Math.random() * NUM_SYMBOLS);
      cell.dataset.sym = sym;
      const img = document.createElement('img');
      img.src = SYMBOLS[sym];
      img.alt = '';
      img.draggable = false;
      cell.appendChild(img);
      grid.appendChild(cell);
    }
  }
}

function spin() {
  document.querySelectorAll('.cell').forEach(cell => {
    const sym = Math.floor(Math.random() * NUM_SYMBOLS);
    cell.dataset.sym = sym;
    cell.querySelector('img').src = SYMBOLS[sym];
  });
}

initGrid();
document.getElementById('spinBtn').addEventListener('click', spin);
