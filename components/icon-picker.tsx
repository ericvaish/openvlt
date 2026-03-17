"use client"

import * as React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊",
      "😇", "🥰", "😍", "🤩", "😘", "😎", "🤓", "🧐", "🤔", "🤗",
      "😏", "😴", "🥳", "🤠", "😈", "👻", "💀", "🤖", "👽", "🎃",
    ],
  },
  {
    name: "Objects",
    emojis: [
      "📝", "📄", "📑", "📋", "📌", "📎", "📐", "📏", "📕", "📗",
      "📘", "📙", "📚", "📖", "🔖", "📰", "🗞️", "🏷️", "💼", "📁",
      "📂", "🗂️", "📆", "📅", "🗒️", "🗓️", "📇", "🔑", "🔒", "🔓",
    ],
  },
  {
    name: "Symbols",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️",
      "💕", "💞", "💓", "💗", "💖", "💘", "💝", "⭐", "🌟", "✨",
      "⚡", "🔥", "💥", "🌈", "☀️", "🌙", "⛅", "🌊", "🍀", "🌸",
    ],
  },
  {
    name: "Activities",
    emojis: [
      "🎯", "🎮", "🎲", "🧩", "🎨", "🎭", "🎪", "🎬", "🎤", "🎧",
      "🎵", "🎶", "🎹", "🥁", "🎸", "🎺", "🏆", "🥇", "🏅", "🎖️",
      "🚀", "✈️", "🛸", "🏠", "🏢", "🏗️", "⚙️", "🔧", "🔬", "💡",
    ],
  },
  {
    name: "Food",
    emojis: [
      "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒",
      "🍑", "🥝", "🍅", "🥑", "🌽", "🥕", "🧄", "🧅", "🍞", "🧁",
      "☕", "🍵", "🧃", "🍷", "🍺", "🥤", "🧊", "🍕", "🌮", "🍔",
    ],
  },
  {
    name: "Animals",
    emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦅", "🦉",
      "🦄", "🐝", "🦋", "🐌", "🐞", "🐢", "🐙", "🦀", "🐠", "🐬",
    ],
  },
]

interface IconPickerProps {
  value: string | null
  onChange: (icon: string | null) => void
  children: React.ReactNode
}

export function IconPicker({ value, onChange, children }: IconPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const filteredCategories = search
    ? EMOJI_CATEGORIES.map((cat) => ({
        ...cat,
        emojis: cat.emojis.filter(() => cat.name.toLowerCase().includes(search.toLowerCase())),
      })).filter((cat) => cat.emojis.length > 0)
    : EMOJI_CATEGORIES

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex flex-col">
          <div className="border-b px-3 py-2">
            <input
              type="text"
              placeholder="Search category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {value && (
              <button
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className="mb-2 w-full rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                Remove icon
              </button>
            )}
            {filteredCategories.map((category) => (
              <div key={category.name} className="mb-2">
                <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  {category.name}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {category.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onChange(emoji)
                        setOpen(false)
                      }}
                      className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
