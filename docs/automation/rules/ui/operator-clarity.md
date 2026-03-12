# Operator Clarity

Staff should be able to answer the key operational questions from the product UI itself.

For SMS confirmation flows, the UI should show whether a confirmation SMS was sent, what the latest outbound request was, whether the patient replied, how the reply was interpreted, whether appointment state actually changed, and why not if it did not.

In practice, the smallest useful surface is a compact two-column summary: latest outbound message on one side, latest inbound reply on the other, with a single summary badge above them. That gives operators a fast read without opening provider dashboards or scanning raw logs.
