import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { CREATE_GUIDANCE_TUTORIALS } from "./guidance-catalog.js";

export const CREATE_GUIDE_ITEM = "createbedrock:engineers_guide";

let opened = 0;
let registered = false;

export function searchCreateGuidance(query) {
	const normalized = String(query ?? "").toLowerCase().replace(/^createbedrock:/, "");
	if (!normalized)
		return CREATE_GUIDANCE_TUTORIALS;
	return CREATE_GUIDANCE_TUTORIALS.filter(tutorial => tutorial.id.includes(normalized) || tutorial.keywords.some(keyword => normalized.includes(keyword) || keyword.includes(normalized)) || tutorial.pages.some(page => page.id.includes(normalized)));
}

function showPage(player, tutorial, index) {
	const page = tutorial.pages[index];
	if (!page)
		return;
	const form = new ActionFormData().title({ translate: page.titleKey }).body({ translate: page.bodyKey });
	if (index > 0)
		form.button("Previous");
	if (index + 1 < tutorial.pages.length)
		form.button("Next");
	form.button("Guide index");
	form.show(player).then(response => {
		if (response.canceled)
			return;
		const previous = index > 0;
		if (previous && response.selection === 0)
			showPage(player, tutorial, index - 1);
		else if (index + 1 < tutorial.pages.length && response.selection === (previous ? 1 : 0))
			showPage(player, tutorial, index + 1);
		else
			showGuideIndex(player);
	});
}

export function showGuideIndex(player, query = "") {
	const tutorials = searchCreateGuidance(query);
	const form = new ActionFormData().title("Create Engineer's Guide").body(`${tutorials.length} Java Ponder-equivalent feature families. Select a family for goals, setup, expected results, and troubleshooting.`);
	for (const tutorial of tutorials)
		form.button(`${tutorial.owner.replace(/Scenes$/, "")} (${tutorial.pages.length})`);
	form.show(player).then(response => {
		if (!response.canceled && Number.isInteger(response.selection) && tutorials[response.selection])
			showPage(player, tutorials[response.selection], 0);
	});
	opened++;
}

export function getGuidanceDiagnostics() {
	return { opened, tutorials: CREATE_GUIDANCE_TUTORIALS.length };
}

export function registerGuidance() {
	if (registered)
		return false;
	registered = true;
	world.afterEvents.itemUse.subscribe(event => {
		if (event.itemStack?.typeId === CREATE_GUIDE_ITEM)
			showGuideIndex(event.source);
	});
	world.afterEvents.itemUseOn.subscribe(event => {
		if (event.itemStack?.typeId !== CREATE_GUIDE_ITEM)
			return;
		const match = searchCreateGuidance(event.block?.typeId)?.[0];
		if (match)
			showPage(event.source, match, 0);
		else
			showGuideIndex(event.source);
	});
	return true;
}
