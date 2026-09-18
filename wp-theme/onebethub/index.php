<?php
/**
 * Generic fallback loop (blog index fallback / anything without a more
 * specific template). Reuses the same card styling as category.php's
 * main list so the site never shows an unstyled WP default view.
 */
get_header();
?>
<div class="max-w-content mx-auto px-4 md:px-8 py-8">
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
		<section class="lg:col-span-8 space-y-4">
			<?php if ( have_posts() ) : while ( have_posts() ) : the_post(); ?>
				<article class="bg-white border border-slate-200 hover:border-sky-300 rounded-xl p-5 md:p-6 transition-all duration-200 shadow-xs hover:shadow-md">
					<div class="space-y-2">
						<div class="flex flex-wrap items-center gap-2">
							<?php foreach ( get_the_category() as $cat ) : echo onebethub_category_badge( $cat, 'lg' ); endforeach; ?>
							<span class="text-xs text-slate-400">• <?php echo esc_html( get_the_date() ); ?></span>
						</div>
						<h2 class="text-lg font-bold text-slate-900 hover:text-sky-600 transition">
							<a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
						</h2>
						<p class="text-xs text-slate-600 leading-relaxed line-clamp-2"><?php echo esc_html( onebethub_card_excerpt( get_the_ID(), 160 ) ); ?></p>
					</div>
					<div class="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
						<span class="text-slate-500"><?php the_author(); ?></span>
						<a class="inline-flex items-center gap-1 font-bold text-sky-600 hover:text-sky-700 transition" href="<?php the_permalink(); ?>">
							<span><?php esc_html_e( '리포트 열람하기', 'onebethub' ); ?></span>
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>
						</a>
					</div>
				</article>
			<?php endwhile; ?>
				<nav class="pt-6" aria-label="<?php esc_attr_e( '페이지네이션', 'onebethub' ); ?>">
					<?php the_posts_pagination( array( 'mid_size' => 2 ) ); ?>
				</nav>
			<?php else : ?>
				<p class="py-10 text-sm text-slate-500"><?php esc_html_e( '게시된 콘텐츠가 없습니다.', 'onebethub' ); ?></p>
			<?php endif; ?>
		</section>
		<aside class="lg:col-span-4 space-y-6">
			<div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
				<h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4"><?php esc_html_e( '카테고리', 'onebethub' ); ?></h3>
				<div class="space-y-2">
					<?php foreach ( onebethub_primary_categories() as $cat ) : ?>
						<a class="group flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition" href="<?php echo esc_url( get_category_link( $cat ) ); ?>">
							<span class="text-xs font-bold text-slate-800 group-hover:text-sky-600"><?php echo esc_html( $cat->name ); ?></span>
							<span class="text-slate-300 group-hover:text-slate-500 font-bold">→</span>
						</a>
					<?php endforeach; ?>
				</div>
			</div>
		</aside>
	</div>
</div>
<?php get_footer(); ?>
