"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface Store {
  id: string;
  name: string;
  city: string | null;
}

interface StoreSearchProps {
  value: string;
  onChange: (storeId: string) => void;
  placeholder?: string;
}

export function StoreSearch({
  value,
  onChange,
  placeholder = "Rechercher un magasin...",
}: StoreSearchProps) {
  const [search, setSearch] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          `/api/stores?limit=50&search=${encodeURIComponent(search)}`
        );
        if (res.ok) {
          const data = await res.json();
          setStores(data.stores);
        }
      } catch {
        // ignore network errors
      }
    };
    load();
  }, [search]);

  // Load initial label for selected value
  useEffect(() => {
    if (value && !selectedLabel) {
      fetch(`/api/stores/${value}`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((data) => {
          if (data.name) {
            setSelectedLabel(`${data.name}${data.city ? ` (${data.city})` : ""}`);
          }
        })
        .catch(() => {});
    }
  }, [value, selectedLabel]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder={placeholder}
          value={open ? search : selectedLabel || search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="pl-9"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {stores.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              Aucun magasin trouvé
            </div>
          ) : (
            stores.map((store) => (
              <button
                key={store.id}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                  store.id === value ? "bg-gray-100 font-medium" : ""
                }`}
                onClick={() => {
                  onChange(store.id);
                  const label = `${store.name}${store.city ? ` (${store.city})` : ""}`;
                  setSelectedLabel(label);
                  setSearch("");
                  setOpen(false);
                }}
              >
                <span className="font-medium">{store.name}</span>
                {store.city && (
                  <span className="text-gray-400 ml-2">{store.city}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
