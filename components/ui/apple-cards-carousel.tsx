"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image, { type ImageProps } from "next/image";
import { IconArrowNarrowLeft, IconArrowNarrowRight, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useOutsideClick } from "@/hooks/use-outside-click";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardType = {
  /** Image src — shown via BlurImage. Omit when using `background`. */
  src?: string;
  /** Custom background node (gradient divs, etc.) rendered at z-10. */
  background?: React.ReactNode;
  /** Extra content rendered at z-40 (badges, overlays). */
  extra?: React.ReactNode;
  title: string;
  category: string;
  description?: string;
  /** Content shown inside the expanded card overlay. */
  content?: React.ReactNode;
  /** Custom click handler — when provided, skips the expand animation. */
  onClick?: () => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type CarouselContextType = {
  onCardClose: (index: number) => void;
  currentIndex: number;
};

export const CarouselContext = createContext<CarouselContextType>({
  onCardClose: () => {},
  currentIndex: 0,
});

// ---------------------------------------------------------------------------
// BlurImage
// ---------------------------------------------------------------------------

export const BlurImage = ({
  height,
  width,
  src,
  className,
  alt,
  ...rest
}: ImageProps) => {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <Image
      className={cn(
        "transition duration-300",
        isLoading ? "blur-sm" : "blur-0",
        className
      )}
      onLoad={() => setIsLoading(false)}
      src={src}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      alt={alt ?? "Card background"}
      {...rest}
    />
  );
};

// ---------------------------------------------------------------------------
// Carousel
// ---------------------------------------------------------------------------

export const Carousel = ({
  items,
  initialScroll = 0,
}: {
  items: React.ReactNode[];
  initialScroll?: number;
}) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = initialScroll;
      checkScrollability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScroll]);

  const checkScrollability = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scrollLeft = () =>
    carouselRef.current?.scrollBy({ left: -320, behavior: "smooth" });

  const scrollRight = () =>
    carouselRef.current?.scrollBy({ left: 320, behavior: "smooth" });

  const handleCardClose = useCallback((index: number) => {
    if (!carouselRef.current) return;
    const isMobile = window.innerWidth < 768;
    const cardWidth = isMobile ? 176 : 288;
    const gap = isMobile ? 4 : 8;
    carouselRef.current.scrollTo({
      left: (cardWidth + gap) * (index + 1),
      behavior: "smooth",
    });
    setCurrentIndex(index);
  }, []);

  return (
    <CarouselContext.Provider
      value={{ onCardClose: handleCardClose, currentIndex }}
    >
      <div className="relative w-full">
        {/* Scroll container */}
        <div
          ref={carouselRef}
          onScroll={checkScrollability}
          className={cn(
            "flex w-full overflow-x-scroll overscroll-x-auto py-8 md:py-12",
            "scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none]",
            "[&::-webkit-scrollbar]:hidden"
          )}
        >
          <div className="flex flex-row justify-start gap-4 pl-4 max-w-7xl mx-auto">
            {items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, delay: 0.15 * i, ease: "easeOut" },
                }}
                className="last:pr-[5%] md:last:pr-[33%] rounded-3xl"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        <div className="flex justify-end gap-2 mr-10">
          <button
            onClick={scrollLeft}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
            className={cn(
              "relative z-40 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center",
              "transition-opacity disabled:opacity-30 hover:bg-gray-200"
            )}
          >
            <IconArrowNarrowLeft className="h-6 w-6 text-gray-600" />
          </button>
          <button
            onClick={scrollRight}
            disabled={!canScrollRight}
            aria-label="Scroll right"
            className={cn(
              "relative z-40 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center",
              "transition-opacity disabled:opacity-30 hover:bg-gray-200"
            )}
          >
            <IconArrowNarrowRight className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      </div>
    </CarouselContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const Card = ({
  card,
  index,
  layout = false,
}: {
  card: CardType;
  index: number;
  layout?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { onCardClose } = useContext(CarouselContext);

  // Lock body scroll and handle Escape when card is expanded
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }

    document.body.style.overflow = open ? "hidden" : "";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Memoize to satisfy useOutsideClick's stable-ref requirement
  const handleClose = useCallback(() => {
    setOpen(false);
    onCardClose(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, onCardClose]);

  useOutsideClick(containerRef, handleClose);

  function handleOpen() {
    if (card.onClick) {
      card.onClick();
      return;
    }
    setOpen(true);
  }

  return (
    <>
      {/* ── Expanded overlay ── */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 h-screen z-50 overflow-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-black/80 backdrop-blur-lg h-full w-full fixed inset-0"
            />

            {/* Card content */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              ref={containerRef}
              layoutId={layout ? `card-${card.title}` : undefined}
              className="max-w-5xl mx-auto bg-white h-fit z-[60] my-10 p-4 md:p-10 rounded-3xl relative"
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                aria-label="Close"
                className="sticky top-4 h-8 w-8 right-0 ml-auto bg-black rounded-full flex items-center justify-center"
              >
                <IconX className="h-5 w-5 text-white" />
              </button>

              <motion.p
                layoutId={layout ? `category-${card.title}` : undefined}
                className="text-base font-medium text-black mt-2"
              >
                {card.category}
              </motion.p>
              <motion.p
                layoutId={layout ? `title-${card.title}` : undefined}
                className="text-2xl md:text-5xl font-semibold text-neutral-700 mt-4"
              >
                {card.title}
              </motion.p>
              {card.description && (
                <p className="text-neutral-500 text-base mt-3 leading-relaxed">
                  {card.description}
                </p>
              )}
              {card.content && <div className="py-10">{card.content}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Closed card (thumbnail) ── */}
      <motion.button
        layoutId={layout ? `card-${card.title}` : undefined}
        onClick={handleOpen}
        aria-label={card.title}
        className={cn(
          "rounded-3xl h-64 w-44 md:h-[30rem] md:w-72",
          "overflow-hidden flex flex-col items-start justify-start relative z-10",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          "transition-transform duration-300 hover:scale-[1.02]"
        )}
      >
        {/* Top gradient — improves title readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent z-30 pointer-events-none" />

        {/* Bottom gradient — improves description readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent z-30 pointer-events-none" />

        {/* Category + title */}
        <div className="relative z-40 p-4 md:p-6">
          <motion.p
            layoutId={layout ? `category-${card.title}` : undefined}
            className="text-white/70 text-xs font-semibold uppercase tracking-widest text-left"
          >
            {card.category}
          </motion.p>
          <motion.p
            layoutId={layout ? `title-${card.title}` : undefined}
            className="text-white text-lg md:text-2xl font-bold max-w-xs text-left [text-wrap:balance] mt-1.5 leading-tight"
          >
            {card.title}
          </motion.p>
        </div>

        {/* Description — bottom of card */}
        {card.description && (
          <div className="absolute bottom-4 left-4 right-4 z-40">
            <p className="text-white/60 text-xs md:text-sm leading-relaxed line-clamp-2 text-left">
              {card.description}
            </p>
          </div>
        )}

        {/* Extra content (badges, coming-soon overlays) */}
        {card.extra && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            {card.extra}
          </div>
        )}

        {/* Background: image or custom node */}
        <div className="absolute inset-0 z-10">
          {card.src ? (
            <BlurImage
              src={card.src}
              alt={card.title}
              fill
              className="object-cover"
            />
          ) : (
            card.background
          )}
        </div>
      </motion.button>
    </>
  );
};
