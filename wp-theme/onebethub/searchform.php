<?php
/**
 * Search form partial — styling matches the header's inline search field
 * from the Stitch mockups (rounded, slate-100 background, magnifier icon).
 */
$onebethub_unique_id = wp_unique_id( 'onebethub-search-' );
?>
<form role="search" method="get" class="w-full" action="<?php echo esc_url( home_url( '/' ) ); ?>">
	<div class="relative flex items-center">
		<svg class="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
		</svg>
		<label for="<?php echo esc_attr( $onebethub_unique_id ); ?>" class="sr-only"><?php esc_html_e( '검색', 'onebethub' ); ?></label>
		<input
			type="search"
			id="<?php echo esc_attr( $onebethub_unique_id ); ?>"
			class="w-full bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-xs text-slate-800 pl-10 pr-4 py-2 rounded border border-slate-200 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition"
			placeholder="<?php echo esc_attr_x( '벤더 SLA, API 규격, GGR 수수료 비교, 라이선스 검색...', 'placeholder', 'onebethub' ); ?>"
			value="<?php echo get_search_query( true ); ?>"
			name="s"
		/>
	</div>
</form>
