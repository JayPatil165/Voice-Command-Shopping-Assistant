"use client";

import { useState } from "react";
import { Plus, List as ListIcon, LogOut, Loader2, Moon, Sun, User as UserIcon, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useTheme } from "next-themes";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ShoppingList = {
  id: string;
  name: string;
};

export function Sidebar({
  activeListId,
  setActiveListId,
  lists,
  setLists,
  isLoading,
  onOpenProfile,
  onDeleteList,
  onRenameList,
  isOpen,
  onClose
}: {
  activeListId: string | null;
  setActiveListId: (id: string) => void;
  lists: ShoppingList[];
  setLists: React.Dispatch<React.SetStateAction<ShoppingList[]>>;
  isLoading: boolean;
  onOpenProfile: () => void;
  onDeleteList: (list: ShoppingList) => void;
  onRenameList: (list: ShoppingList) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { token, username, logout } = useAuth();
  const [newListName, setNewListName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newListName }),
      });
      if (!res.ok) throw new Error("Failed to create list");
      
      const newList = await res.json();
      setLists((prev) => [...prev, newList]);
      setActiveListId(newList.id);
      setNewListName("");
      toast.success("List created!");
    } catch (err) {
      console.error(err);
      toast.error("Could not create list.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
          onClick={onClose}
        />
      )}
      <div className={`fixed md:relative flex w-64 flex-col border-r bg-card z-40 shadow-[4px_0_24px_rgba(0,0,0,0.05)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.2)] h-full transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold tracking-tight text-lg flex items-center gap-2">
          <ListIcon className="h-5 w-5" /> My Lists
        </h2>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-8 w-8"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          lists.map((list) => (
            <div
              key={list.id}
              className={`group flex items-center justify-between rounded-md px-1 py-1 transition-all ${
                activeListId === list.id
                  ? "bg-primary text-primary-foreground shadow-md font-semibold"
                  : "hover:bg-muted"
              }`}
            >
              <button
                onClick={() => setActiveListId(list.id)}
                className={`flex-1 text-left px-2 py-1 text-sm font-medium ${activeListId === list.id ? "" : "text-muted-foreground group-hover:text-foreground"}`}
              >
                {list.name}
              </button>
              <div className={`flex opacity-0 group-hover:opacity-100 transition-opacity ${activeListId === list.id ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                <button
                  onClick={() => onRenameList(list)}
                  className={`p-1 rounded-md transition-colors ${activeListId === list.id ? "hover:bg-primary-foreground/20" : "hover:bg-muted-foreground/20"}`}
                  title="Rename list"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDeleteList(list)}
                  className={`p-1 rounded-md transition-colors ${activeListId === list.id ? "hover:bg-primary-foreground/20 hover:text-red-300" : "hover:bg-muted-foreground/20 hover:text-red-500"}`}
                  title="Delete list"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t space-y-4">
        <form onSubmit={handleCreateList} className="flex flex-col gap-2">
          <Input
            placeholder="New list name..."
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            disabled={isCreating}
            className="text-sm"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isCreating || !newListName.trim()} className="w-full">
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Add List
          </Button>
        </form>

        <div className="pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer hover:bg-muted p-1 rounded-md transition-colors" onClick={onOpenProfile}>
            <div className="h-7 w-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
               <UserIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium truncate max-w-[100px]">
              {username}
            </span>
          </div>
          <Button size="icon" variant="ghost" onClick={logout} title="Logout" className="h-8 w-8">
            <LogOut className="h-4 w-4 text-muted-foreground hover:text-red-500 transition-colors" />
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}
