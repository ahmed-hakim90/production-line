type ListScroller = {
  scrollTop: number;
  getBoundingClientRect: () => { top: number; bottom: number };
};

type ListOption = {
  getBoundingClientRect: () => { top: number; bottom: number };
};

/**
 * Put the first filtered row directly under the search field.
 * Browser scroll anchoring otherwise keeps the previous row in view,
 * so the match looks like it never appeared.
 */
export function pinListScrollToTop(list: { scrollTop: number } | null | undefined) {
  if (!list || list.scrollTop === 0) return;
  list.scrollTop = 0;
}

/**
 * Move the active option inside the list only.
 * `scrollIntoView` also scrolls the page and the modal, which pulls the
 * highlighted row away from the search field.
 */
export function scrollOptionWithinList(list: ListScroller, option: ListOption | null | undefined) {
  if (!option) {
    pinListScrollToTop(list);
    return;
  }
  const listRect = list.getBoundingClientRect();
  const optionRect = option.getBoundingClientRect();
  if (optionRect.top < listRect.top) {
    list.scrollTop -= listRect.top - optionRect.top;
  } else if (optionRect.bottom > listRect.bottom) {
    list.scrollTop += optionRect.bottom - listRect.bottom;
  }
}
