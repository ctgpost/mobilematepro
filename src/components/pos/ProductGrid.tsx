import { Card } from "@/components/ui/card";
import { Product } from "./types";

interface ProductGridProps {
  products: Product[] | undefined;
  onAddToCart: (product: Product) => void;
}

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  if (!products) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 pb-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4 h-24 animate-pulse bg-muted/40" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="text-4xl mb-2">📦</div>
        <p className="text-sm">কোনো পণ্য পাওয়া যায়নি</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 pb-4">
      {products.map((product) => {
        const outOfStock = (product.stock_quantity ?? 0) <= 0;
        return (
          <Card
            key={product.id}
            role="button"
            tabIndex={outOfStock ? -1 : 0}
            aria-disabled={outOfStock}
            className={`p-3 lg:p-4 ${outOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer card-hover"}`}
            onClick={() => !outOfStock && onAddToCart(product)}
            onKeyDown={(e) => {
              if (!outOfStock && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onAddToCart(product);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm lg:text-base text-foreground truncate">
                  {product.name}
                </h3>
                {product.imei && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">IMEI: {product.imei}</p>
                )}
                <p className="text-sm font-bold text-primary mt-1">
                  ৳{Number(product.price || 0).toLocaleString("bn-BD")}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {product.condition && (
                  <span
                    className={`inline-flex items-center justify-center text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                      product.condition === "new"
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                    }`}
                  >
                    {product.condition === "new" ? "নতুন" : "পুরাতন"}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                    outOfStock
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {outOfStock
                    ? "স্টক শেষ"
                    : `স্টক: ${Number(product.stock_quantity).toLocaleString("bn-BD")}`}
                </span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
