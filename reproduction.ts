
import { BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

// Mock types
interface Product {
    id: number;
    title: string;
    category: string;
}

// Mock data
const products: Product[] = [
    { id: 1, title: 'Product 1', category: "men's clothing" },
    { id: 2, title: 'Product 2', category: 'jewelry' },
    { id: 3, title: 'Product 3', category: 'electronics' },
];

// Mock inputs
const allProducts$ = new BehaviorSubject<Product[]>(products);
const activeCategory$ = new BehaviorSubject<string>('');

// Logic from products.view.ts
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
