export function beltSegmentForNeighbors({ hasNext, hasPrevious }) {
	if (hasPrevious && hasNext)
		return "middle";
	if (hasNext)
		return "start";
	if (hasPrevious)
		return "end";
	return "single";
}
