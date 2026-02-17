
const { BehaviorSubject, combineLatest } = require('rxjs');
const { map } = require('rxjs/operators');

// Mock data
const products = [
    { id: 1, title: 'Product 1', category: "men's clothing" },
    { id: 2, title: 'Product 2', category: 'jewelry' },
    { id: 3, title: 'Product 3', category: 'electronics' },
];

// Mock inputs
const allProducts$ = new BehaviorSubject(products);
const activeCategory$ = new BehaviorSubject('');

// Logic
const filtered$ = combineLatest([
    allProducts$,
    activeCategory$,
]).pipe(
    map(([products, category]) => {
        console.log(`Filtering for category: "${category}"`);
        if (category) {
            return products.filter(p => p.category === category);
        }
        return products;
    })
);

// Test
filtered$.subscribe(result => {
    console.log('Result count:', result.length);
    result.forEach(p => console.log(' -', p.title, `(${p.category})`));
});

// Simulate user action
console.log('\n--- Selecting "electronics" ---');
activeCategory$.next('electronics');

console.log('\n--- Selecting "men\'s clothing" ---');
activeCategory$.next("men's clothing");

console.log('\n--- Selecting "Men\'s Clothing" (case mismatch) ---');
activeCategory$.next("Men's Clothing");
