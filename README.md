# Corner Radii

The purpose of this interactive demonstration is provide a convient space to visualize the perfect nested border-radius formula as calcuated based on the below:
```css
border-radius: max(0px, calc(var(--radius) - var(--gap)));
```
Outer radius and padding update the nested-radius calculation, while the linked
inner-radius control updates padding in reverse. Size resizes the square example.

The Redlines switch in the Card Example header reveals the spacing stencil and
persists its visibility between visits.
