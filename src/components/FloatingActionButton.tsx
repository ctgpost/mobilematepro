import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart, Package, X } from "lucide-react";

interface FloatingActionButtonProps {
  onNewSale?: () => void;
  onAddProduct?: () => void;
}

export function FloatingActionButton({ onNewSale, onAddProduct }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 z-40 animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* FAB Container */}
      <div className="lg:hidden fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-3">
        {/* Action Buttons */}
        {isOpen && (
          <>
            <Button
              onClick={() => {
                onNewSale?.();
                setIsOpen(false);
              }}
              className="shadow-lg animate-scale-in hover:scale-105 transition-transform"
              size="lg"
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              New Sale
            </Button>
            
            <Button
              onClick={() => {
                onAddProduct?.();
                setIsOpen(false);
              }}
              className="shadow-lg animate-scale-in hover:scale-105 transition-transform"
              size="lg"
              variant="secondary"
            >
              <Package className="h-5 w-5 mr-2" />
              Add Product
            </Button>
          </>
        )}

        {/* Main FAB Button */}
        <Button
          onClick={toggleMenu}
          className={`h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-all ${
            isOpen ? "rotate-45" : ""
          }`}
          size="icon"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </Button>
      </div>
    </>
  );
}
