import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  condition: string | null;
  price: number;
  cost: number;
  stock_quantity: number;
  ram: string | null;
  storage: string | null;
  battery: string | null;
  image_url: string | null;
}

interface ProductQuickViewProps {
  products: Product[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ProductQuickView({ products, initialIndex, isOpen, onClose }: ProductQuickViewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const currentProduct = products[currentIndex];

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < products.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < products.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!currentProduct) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-0"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Navigation Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-border p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {currentIndex + 1} / {products.length}
            </p>
            <p className="text-xs text-muted-foreground">Swipe to navigate</p>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            disabled={currentIndex === products.length - 1}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Product Content */}
        <div className="p-4 space-y-4">
          {/* Product Header */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">{currentProduct.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Badge variant={currentProduct.condition === "new" ? "default" : "secondary"}>
                {currentProduct.condition?.toUpperCase()}
              </Badge>
              {currentProduct.stock_quantity > 0 ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  In Stock ({currentProduct.stock_quantity})
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  Out of Stock
                </Badge>
              )}
            </div>
          </div>

          {/* Price Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Sale Price</p>
                  <p className="text-2xl font-bold text-accent">৳{currentProduct.price.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Cost</p>
                  <p className="text-lg font-semibold text-muted-foreground">৳{currentProduct.cost.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Product Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentProduct.brand && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Brand:</span>
                  <span className="text-sm font-medium">{currentProduct.brand}</span>
                </div>
              )}
              {currentProduct.model && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Model:</span>
                  <span className="text-sm font-medium">{currentProduct.model}</span>
                </div>
              )}
              {currentProduct.imei && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">IMEI:</span>
                  <span className="text-sm font-medium font-mono">{currentProduct.imei}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Specifications */}
          {(currentProduct.ram || currentProduct.storage || currentProduct.battery) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Specifications</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                {currentProduct.ram && (
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">RAM</p>
                    <p className="font-semibold">{currentProduct.ram}</p>
                  </div>
                )}
                {currentProduct.storage && (
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Storage</p>
                    <p className="font-semibold">{currentProduct.storage}</p>
                  </div>
                )}
                {currentProduct.battery && (
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Battery</p>
                    <p className="font-semibold">{currentProduct.battery}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation Dots */}
          <div className="flex justify-center gap-2 pt-4">
            {products.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentIndex 
                    ? "w-8 bg-primary" 
                    : "w-2 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
