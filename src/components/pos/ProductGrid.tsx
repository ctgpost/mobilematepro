import { Card } from "@/components/ui/card";
import { Product } from "./types";

interface ProductGridProps {
  products: Product[] | undefined;
  onAddToCart: (product: Product) => void;
}

export function ProductGrid({ products, onAddToCart }: ProductGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 pb-4">
      {products?.map((product) => (
        <Card
          key={product.id}
          className="p-3 lg:p-4 cursor-pointer card-hover"
          onClick={() => onAddToCart(product)}
        >
          <div className="flex lg:flex-col items-center lg:items-start gap-3 lg:gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm lg:text-base text-foreground truncate">
                {product.name}
              </h3>
              {product.imei && (
                <p className="text-xs text-muted-foreground mt-1">IMEI: {product.imei}</p>
              )}
            </div>
            {product.condition && (
              <span
                className={`inline-flex items-center justify-center text-xs px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${
                  product.condition === "new"
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                }`}
              >
                {product.condition === "new" ? "নতুন" : "পুরাতন"}
              </span>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
