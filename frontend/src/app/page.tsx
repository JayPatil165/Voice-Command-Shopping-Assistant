"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Search, ShoppingCart, Trash2, SlidersHorizontal, List as ListIcon, X, CheckCircle2, Circle, Plus, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthContext";
import { LoginScreen } from "@/components/LoginScreen";
import { Sidebar } from "@/components/Sidebar";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ShoppingList = {
  id: string;
  name: string;
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  category: string;
  is_completed?: boolean;
};

type IntentResponse = {
  action: "add" | "remove" | "update" | "search" | "suggest" | "create_list" | "rename_list" | "delete_list";
  target_list_name?: string | null;
  new_list_name?: string | null;
  items: ShoppingItem[];
  original_text: string;
  follow_up_question?: string | null;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const categoryColors: Record<string, string> = {
  Dairy: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  Produce: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  Bakery: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  Meat: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  Snacks: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  Stationery: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800",
  Hardware: "bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900/30 dark:text-stone-300 dark:border-stone-700",
  Household: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800",
  Party: "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800",
  Groceries: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  General: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

const getCategoryBorder = (category: string) => {
  switch (category) {
    case "Produce": return "border-emerald-200 dark:border-emerald-800/50";
    case "Dairy": return "border-blue-200 dark:border-blue-800/50";
    case "Meat": return "border-rose-200 dark:border-rose-800/50";
    case "Bakery": return "border-amber-200 dark:border-amber-800/50";
    case "Pantry": return "border-orange-200 dark:border-orange-800/50";
    case "Frozen": return "border-cyan-200 dark:border-cyan-800/50";
    case "Household": return "border-slate-200 dark:border-slate-800/50";
    case "Stationery": return "border-violet-200 dark:border-violet-800/50";
    case "Hardware": return "border-stone-200 dark:border-stone-700/50";
    case "Party": return "border-pink-200 dark:border-pink-800/50";
    default: return "border-zinc-200 dark:border-zinc-800/50";
  }
};

function getCategoryColor(category: string) {
  return categoryColors[category] || categoryColors.General;
}

export default function ShoppingAssistant() {
  const { token, login, isInitialized } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [listToDelete, setListToDelete] = useState<ShoppingList | null>(null);
  const [listToRename, setListToRename] = useState<ShoppingList | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsReason, setSuggestionsReason] = useState("");
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [previousCommand, setPreviousCommand] = useState<string | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [sortBy, setSortBy] = useState("name");

  const [typedCommand, setTypedCommand] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState("");

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const shouldProcessOnEndRef = useRef(false);

  const fetchLists = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/lists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLists(data);
        if (data.length > 0 && !activeListId) {
          setActiveListId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not load your lists.");
    } finally {
      setIsLoadingLists(false);
    }
  }, [token, activeListId]);

  useEffect(() => {
    if (token) fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchSuggestions = useCallback(async (overrideItems?: ShoppingItem[]) => {
     if (!activeListId || !token) return;
     const activeList = lists.find(l => l.id === activeListId);
     const listName = activeList ? activeList.name : "General";
     const itemsToUse = overrideItems || items;
     
     setIsLoadingSuggestions(true);
     try {
         const sugRes = await fetch(`${API_BASE_URL}/api/suggestions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ current_items: itemsToUse, list_name: listName })
         });
         if (sugRes.ok) {
            const sugData = await sugRes.json();
            const existingNames = new Set(itemsToUse.map((item) => item.name.trim().toLowerCase()));
            const cleanedSuggestions = (sugData.suggestions as string[])
              .filter((suggestion) => suggestion && !existingNames.has(suggestion.trim().toLowerCase()))
              .slice(0, 3);
            setSuggestions(cleanedSuggestions);
            setSuggestionsReason(sugData.reason);
         } else {
            toast.error("AI Suggestions failed or rate limited. Try again later.");
         }
     } catch (err) {
         console.error(err);
         toast.error("AI Suggestions failed.");
     } finally {
         setIsLoadingSuggestions(false);
     }
  }, [activeListId, token, items, lists]);

  const fetchItems = useCallback(async () => {
    if (!activeListId || !token) return;
    setIsLoadingItems(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lists/${activeListId}/items`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch items");
      const data = await res.json();
      setItems(data);
      fetchSuggestions(data);
    } catch (err) {
      console.error(err);
      toast.error("Could not load list items.");
    } finally {
      setIsLoadingItems(false);
    }
  }, [activeListId, token, fetchSuggestions]);

  const refreshItemsForList = useCallback(async (listId: string, listNameOverride?: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/lists/${listId}/items`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to refresh items");
      const freshItems = await res.json();
      setItems(freshItems);

      const listName = listNameOverride || lists.find((list) => list.id === listId)?.name || "General";
      const sugRes = await fetch(`${API_BASE_URL}/api/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_items: freshItems, list_name: listName })
      });
      if (sugRes.ok) {
        const sugData = await sugRes.json();
        const existingNames = new Set(freshItems.map((item: ShoppingItem) => item.name.trim().toLowerCase()));
        const cleanedSuggestions = (sugData.suggestions as string[])
          .filter((suggestion) => suggestion && !existingNames.has(suggestion.trim().toLowerCase()))
          .slice(0, 3);
        setSuggestions(cleanedSuggestions);
        setSuggestionsReason(sugData.reason);
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not refresh list items.");
    }
  }, [token, lists]);

  const toggleItemStatus = async (item: ShoppingItem) => {
    if (!token) return;
    const newStatus = !item.is_completed;
    
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: newStatus } : i));
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
           name: item.name, 
           quantity: item.quantity, 
           category: item.category, 
           is_completed: newStatus 
        })
      });
      if (!res.ok) throw new Error();
    } catch (e) {
       toast.error("Failed to update item status");
       setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_completed: !newStatus } : i));
    }
  };

  useEffect(() => {
    if (activeListId && token) fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeListId, token]);

  const applyIntent = useCallback(async (data: IntentResponse, sourceText: string) => {
    if (!token) return;

    if (data.original_text) {
      setTranscription(data.original_text);
    }
    
    let targetListId = activeListId;
    let targetItems = items;
    let targetListName = lists.find((list) => list.id === activeListId)?.name;
    
    // Cross-list support
    if (data.target_list_name) {
       const existingList = lists.find(l => l.name.toLowerCase() === data.target_list_name?.toLowerCase());
       if (existingList) {
          targetListId = existingList.id;
          if (targetListId !== activeListId) {
             const res = await fetch(`${API_BASE_URL}/api/lists/${targetListId}/items`, {
               headers: { Authorization: `Bearer ${token}` }
             });
             if (res.ok) targetItems = await res.json();
             setActiveListId(targetListId);
          }
          targetListName = existingList.name;
       } else {
          // Auto-create list
          const res = await fetch(`${API_BASE_URL}/api/lists`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: data.target_list_name }),
          });
          if (res.ok) {
             const newList = await res.json();
             setLists(prev => [...prev, newList]);
             targetListId = newList.id;
             targetListName = newList.name;
             targetItems = [];
             setActiveListId(targetListId);
             toast.success(`Created new list: ${newList.name}`);
          }
       }
    } else if (data.action === "create_list") {
        toast.error("Please specify a name for the new list.");
        return;
    }
    
    if (!targetListId) {
       toast.error("Please create a list first or specify a list name.");
       return;
    }

    if (data.action === "create_list") {
       // Just created it above
       return;
    }

    if (data.action === "rename_list") {
       if (targetListId && data.new_list_name) {
           try {
               const res = await fetch(`${API_BASE_URL}/api/lists/${targetListId}`, {
                   method: "PUT",
                   headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                   body: JSON.stringify({ name: data.new_list_name })
               });
               if (res.ok) {
                   const updatedList = await res.json();
                   setLists(prev => prev.map(l => l.id === targetListId ? updatedList : l));
                   toast.success(`List renamed to ${updatedList.name}`);
               } else {
                   toast.error("Failed to rename list.");
               }
           } catch (e) {
               toast.error("Error renaming list.");
           }
       } else {
           toast.error("Could not understand which list to rename or the new name.");
       }
       return;
    }

    if (data.action === "delete_list") {
       if (targetListId) {
           const listObj = lists.find(l => l.id === targetListId);
           if (listObj) {
               setListToDelete(listObj);
           }
       } else {
           toast.error("Could not find the list to delete.");
       }
       return;
    }

    if (data.action === "add") {
      let added = 0;
      for (const newItem of data.items) {
        if (!newItem.name || newItem.name === "Unknown Item") continue;
        const existingItem = targetItems.find(i => i.name.toLowerCase() === newItem.name.toLowerCase());
        
        if (existingItem) {
          await fetch(`${API_BASE_URL}/api/items/${existingItem.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ ...newItem, quantity: newItem.quantity || existingItem.quantity })
          });
          added++;
        } else {
          await fetch(`${API_BASE_URL}/api/lists/${targetListId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(newItem)
          });
          added++;
        }
      }
      toast.success(`Added/Updated ${added} item(s).`);
      await refreshItemsForList(targetListId, targetListName);
      return;
    }

    if (data.action === "remove") {
      const namesToRemove = data.items.map((item) => item.name.toLowerCase());
      const toRemove = targetItems.filter((item) => {
        const itemName = item.name.toLowerCase();
        return namesToRemove.some((name) => itemName.includes(name) || name.includes(itemName)) ||
          sourceText.toLowerCase().includes(itemName);
      });

      for (const item of toRemove) {
         await fetch(`${API_BASE_URL}/api/items/${item.id}`, {
           method: "DELETE",
           headers: { Authorization: `Bearer ${token}` }
         });
      }
      toast.success(`Removed ${toRemove.length} item(s).`);
      await refreshItemsForList(targetListId, targetListName);
      return;
    }

    if (data.action === "update") {
      for (const updatedItem of data.items) {
        const match = targetItems.find(i => i.name.toLowerCase().includes(updatedItem.name.toLowerCase()) || updatedItem.name.toLowerCase().includes(i.name.toLowerCase()));
        if (match) {
           await fetch(`${API_BASE_URL}/api/items/${match.id}`, {
             method: "PUT",
             headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
             body: JSON.stringify({
                name: match.name,
                category: updatedItem.category || match.category,
                quantity: updatedItem.quantity || match.quantity,
             })
           });
        }
      }
      toast.success("Items updated.");
      await refreshItemsForList(targetListId, targetListName);
      return;
    }

    if (data.action === "search") {
      const searchText = data.items[0]?.name || sourceText;
      setSearchQuery(searchText);
      toast.success("Search updated.");
      return;
    }

    toast.success(`Intent parsed as: ${data.action}`);
  }, [activeListId, token, items, lists, refreshItemsForList]);

  const processTextCommand = useCallback(async (text: string, fromVoice = false) => {
    const command = text.trim();
    if (!command) return;

    setIsProcessing(true);
    setTranscription(command);

    try {
      const fullCommand = previousCommand ? `Previous context: "${previousCommand}". User answer: "${command}"` : command;
      const response = await fetch(`${API_BASE_URL}/api/parse-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           text: fullCommand, 
           language: "en", 
           current_items: items,
           available_lists: lists.map(l => l.name)
        }),
      });

      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as IntentResponse;
      
      if (data.follow_up_question) {
         setFollowUpQuestion(data.follow_up_question);
         setPreviousCommand(fullCommand);
         toast.info("Need more info!");
      } else {
         await applyIntent(data, command);
         setFollowUpQuestion(null);
         setPreviousCommand(null);
      }
    } catch (error) {
      console.error(error);
      toast.error(fromVoice ? "Transcribed speech, but failed to parse it." : "Failed to process command.");
      setTranscription(command);
    } finally {
      setIsProcessing(false);
    }
  }, [applyIntent, items, lists, previousCommand]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }

      if (finalTranscript) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalTranscript}`.trim();
      }
      interimTranscriptRef.current = interimTranscript;
      setTranscription((finalTranscriptRef.current + " " + interimTranscript).trim());
    };

    recognition.onerror = (event: any) => {
      shouldProcessOnEndRef.current = false;
      setIsRecording(false);
      const message = event.error === "not-allowed"
          ? "Microphone permission was blocked. Allow mic access in the browser and try again."
          : `Speech recognition failed: ${event.error}`;
      toast.error(message);
      setTranscription(message);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (!shouldProcessOnEndRef.current) return;

      const spokenText = (finalTranscriptRef.current + " " + interimTranscriptRef.current).trim();
      shouldProcessOnEndRef.current = false;

      if (!spokenText) {
        setTranscription("No speech detected. Try again closer to the microphone.");
        toast.error("No speech detected.");
        return;
      }

      processTextCommand(spokenText, true);
    };

    recognitionRef.current = recognition;
    return () => {
      shouldProcessOnEndRef.current = false;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [processTextCommand]);

  const toggleListen = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not available. Use Chrome or Edge, or type the command below.");
      return;
    }
    if (isRecording) {
      shouldProcessOnEndRef.current = true;
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    shouldProcessOnEndRef.current = true;
    setTranscription("Listening...");

    try {
      recognitionRef.current.start();
      setIsRecording(true);
      toast("Listening...", { description: "Speak your shopping command, then click the mic again." });
    } catch (error) {
      console.error(error);
      setIsRecording(false);
      toast.error("Could not start speech recognition. Try again in a moment.");
    }
  };

  const removeItem = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/items/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchItems();
    } catch (e) {
      toast.error("Failed to delete item");
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!oldPassword) {
        toast.error("Old password is required to update profile.");
        return;
     }
     setIsUpdatingProfile(true);
     try {
       const res = await fetch(`${API_BASE_URL}/api/auth/profile`, {
         method: "PUT",
         headers: {
           "Content-Type": "application/json",
           Authorization: `Bearer ${token}`
         },
         body: JSON.stringify({
           old_password: oldPassword,
           new_password: newPassword || undefined,
           new_username: newUsername || undefined,
         })
       });
       
       if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Profile update failed");
       }
       
       const data = await res.json();
       toast.success("Profile updated successfully!");
       
       // Need to re-login to get new token if username changed
       if (newUsername) {
          // Quick fetch to get new token
          const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ username: newUsername, password: newPassword || oldPassword })
          });
          if (loginRes.ok) {
             const loginData = await loginRes.json();
             login(loginData.access_token, loginData.username);
          }
       }
       
       setIsProfileOpen(false);
       setOldPassword("");
       setNewPassword("");
       setNewUsername("");
     } catch (err: any) {
       toast.error(err.message);
     } finally {
       setIsUpdatingProfile(false);
     }
  };

  if (!isInitialized) return null;
  if (!token) return <LoginScreen />;

  let filteredItems = items.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
  if (filterCategory !== "All") {
    filteredItems = filteredItems.filter(i => i.category === filterCategory);
  }
  
  if (sortBy === "name") {
    filteredItems.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "category") {
    filteredItems.sort((a, b) => a.category.localeCompare(b.category));
  }

  const allCategories = ["All", ...Array.from(new Set(items.map(i => i.category)))];
  const activeListName = lists.find((list) => list.id === activeListId)?.name;

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar 
        activeListId={activeListId} 
        setActiveListId={setActiveListId} 
        lists={lists} 
        setLists={setLists} 
        isLoading={isLoadingLists}
        onOpenProfile={() => setIsProfileOpen(true)}
        onDeleteList={(list) => setListToDelete(list)}
        onRenameList={(list) => { setListToRename(list); setRenameInput(list.name); }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col relative h-full bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/50 dark:from-indigo-950/20 dark:via-background dark:to-purple-900/20 pb-24 md:pb-0 overflow-y-auto">
        {activeListId ? (
          <>
            <div className="flex flex-col gap-3 p-4 bg-background border-b shadow-sm z-10 sticky top-0">
              <div className="flex gap-2 w-full">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden shrink-0" 
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search items..."
                    className="pl-8 bg-muted/50 focus-visible:bg-background transition-colors"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
                <div className="flex items-center border rounded-md px-2 bg-muted/50 overflow-hidden">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground mr-2" />
                  <select 
                    className="bg-transparent text-sm outline-none border-none pr-1"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="name" className="bg-background text-foreground">Sort by Name</option>
                    <option value="category" className="bg-background text-foreground">Sort by Category</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                 {allCategories.map(cat => (
                   <button 
                     key={cat} 
                     onClick={() => setFilterCategory(cat)}
                     className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${filterCategory === cat ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted border-border'}`}
                   >
                     {cat}
                   </button>
                 ))}
                 
               </div>
            </div>

            <ScrollArea className="flex-1 px-4">
              {isLoadingItems ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-8">
                   {[1,2,3,4].map(i => (
                     <div key={i} className="w-full h-20 bg-muted/40 animate-pulse rounded-xl border border-border" />
                   ))}
                </div>
              ) : filteredItems.length === 0 && suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ShoppingCart className="mb-4 h-12 w-12 opacity-20" />
                  <p>Your list is empty.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  {filteredItems.map((item) => (
                    <Card key={item.id} className={`overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 backdrop-blur-md border-2 rounded-2xl ${getCategoryBorder(item.category)} ${item.is_completed ? 'bg-muted/30 border-dashed opacity-50' : 'bg-white/80 dark:bg-zinc-900/80 shadow-md'}`}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <button 
                             onClick={() => toggleItemStatus(item)} 
                             className="text-muted-foreground hover:text-emerald-500 transition-colors shrink-0"
                          >
                             {item.is_completed ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <Circle className="h-6 w-6" />}
                          </button>
                          <div className={item.is_completed ? "opacity-60" : ""}>
                            <h3 className={`font-medium text-foreground ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>{item.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                               <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">{item.quantity}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={`border ${getCategoryColor(item.category)} ${item.is_completed ? 'opacity-50' : ''}`}>
                            {item.category}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:text-red-500 transition-colors"
                            onClick={() => removeItem(item.id)}
                            title={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {/* Inline AI Suggestions */}
                  {isLoadingSuggestions ? (
                    <div className="w-full h-20 bg-blue-50/50 dark:bg-blue-900/10 animate-pulse rounded-xl border-2 border-dashed border-blue-200 dark:border-blue-800" />
                  ) : suggestions.map(sug => (
                    <Card 
                      key={sug} 
                      onClick={() => processTextCommand(`add 1 ${sug}${activeListName ? ` to ${activeListName}` : ""}`)}
                      className="overflow-hidden transition-all duration-300 hover:shadow-md hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer backdrop-blur-sm border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-xl bg-transparent opacity-80"
                      title={suggestionsReason}
                    >
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                          <Plus className="h-5 w-5 text-blue-500" />
                          <div>
                            <h3 className="font-medium text-blue-600 dark:text-blue-400">{sug}</h3>
                            <Badge variant="secondary" className="text-[10px] mt-1 text-blue-500 bg-blue-100 dark:bg-blue-900/40">AI Suggestion</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
             <ListIcon className="h-12 w-12 opacity-20 mb-4" />
             <p>Create or select a list from the sidebar.</p>
          </div>
        )}

        <div className="fixed bottom-0 md:left-64 left-0 right-0 z-50 flex flex-col items-center border-t bg-background/95 backdrop-blur-md p-4 pb-2 shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
          {isRecording && (
            <div className="mb-4 flex items-center gap-2 rounded-full border border-red-200 bg-red-100 px-5 py-2.5 text-sm font-medium text-red-600 shadow-sm dark:border-red-800 dark:bg-red-900/30 dark:text-red-400 animate-in fade-in zoom-in duration-300">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              Listening... tap mic to finish
            </div>
          )}

          {transcription && (
            <div className="mb-4 max-w-[85%] rounded-full border bg-background px-5 py-2.5 text-center text-sm font-medium text-foreground shadow-sm animate-in fade-in zoom-in duration-300">
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Parsing: &quot;{transcription}&quot;
                </span>
              ) : (
                <span>&quot;{transcription}&quot;</span>
              )}
            </div>
          )}
          
          {followUpQuestion && (
            <div className="w-full max-w-2xl px-4 mb-3">
              <div className="w-full bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm border border-blue-200 dark:border-blue-800 animate-in slide-in-from-bottom-2">
                <span className="text-2xl mt-0.5">🤖</span>
                <div className="flex-1 text-sm font-medium leading-relaxed">
                  {followUpQuestion}
                </div>
                <button onClick={() => setFollowUpQuestion(null)} className="text-blue-500 hover:text-blue-700 bg-blue-100/50 hover:bg-blue-200 p-1.5 rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 w-full max-w-2xl px-2 mb-2">
            <Input
              placeholder="Try: 'create a list groceries' or 'add 4kg potatoes to groceries'"
              className="flex-1 bg-muted/30 border-input focus-visible:ring-primary focus-visible:bg-background rounded-full px-6 h-14 text-base shadow-inner transition-all"
              disabled={isRecording || isProcessing}
              value={typedCommand}
              onChange={(event) => setTypedCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && typedCommand.trim()) {
                  processTextCommand(typedCommand);
                  setTypedCommand("");
                }
              }}
            />
            <Button
              size="icon"
              variant={isRecording ? "destructive" : "default"}
              disabled={isProcessing}
              className={`h-14 w-14 rounded-full shadow-lg transition-all duration-300 ${isRecording ? "scale-110 shadow-red-500/30 ring-4 ring-red-500/20" : "hover:scale-105 hover:shadow-primary/30"}`}
              onClick={toggleListen}
              title="Start voice command"
            >
              {isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
          </div>
          
          <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/30 font-semibold opacity-30 hover:opacity-100 transition-opacity duration-300 cursor-default">
            Developed by Jay Ajitkumar Patil
          </div>
        </div>
      </main>

      <Dialog open={!!listToDelete} onOpenChange={(open) => !open && setListToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the list "{listToDelete?.name}"? All items inside it will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!listToDelete || !token) return;
              try {
                const res = await fetch(`${API_BASE_URL}/api/lists/${listToDelete.id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                   setLists(prev => prev.filter(l => l.id !== listToDelete.id));
                   if (activeListId === listToDelete.id) {
                      setActiveListId(lists.find(l => l.id !== listToDelete.id)?.id || null);
                      setItems([]);
                   }
                   toast.success(`Deleted list "${listToDelete.name}"`);
                } else {
                   toast.error("Failed to delete list.");
                }
              } catch (e) {
                toast.error("Failed to delete list.");
              } finally {
                setListToDelete(null);
              }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!listToRename} onOpenChange={(open) => !open && setListToRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename List</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={renameInput} 
              onChange={(e) => setRenameInput(e.target.value)} 
              placeholder="New list name..." 
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  document.getElementById("btn-rename-list")?.click();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListToRename(null)}>Cancel</Button>
            <Button id="btn-rename-list" onClick={async () => {
              if (!listToRename || !token || !renameInput.trim()) return;
              try {
                const res = await fetch(`${API_BASE_URL}/api/lists/${listToRename.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ name: renameInput.trim() })
                });
                if (res.ok) {
                   const updatedList = await res.json();
                   setLists(prev => prev.map(l => l.id === listToRename.id ? updatedList : l));
                   toast.success(`List renamed to "${updatedList.name}"`);
                } else {
                   toast.error("Failed to rename list.");
                }
              } catch (e) {
                toast.error("Failed to rename list.");
              } finally {
                setListToRename(null);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Profile Settings Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-lg border relative">
            <button 
              onClick={() => setIsProfileOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-semibold mb-4">Profile Settings</h2>
            
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">New Username (Optional)</label>
                <Input 
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password (Optional)</label>
                <Input 
                  type="password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium text-red-500">Current Password (Required)</label>
                <Input 
                  type="password"
                  value={oldPassword} 
                  onChange={e => setOldPassword(e.target.value)}
                  placeholder="Enter current password to save changes"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isUpdatingProfile || !oldPassword}>
                {isUpdatingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
